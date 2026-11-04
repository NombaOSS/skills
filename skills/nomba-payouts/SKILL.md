---
name: nomba-payouts
description: >-
  Send money out with Nomba safely using the official SDKs (Node.js/TypeScript, Python, PHP) - bank transfers with account-name lookup, Nomba wallet transfers, bulk/batch payouts, and bill payments (airtime, data, electricity, cable TV, betting), with idempotency references, requery on timeouts and correct handling of transaction statuses and refunds. Use this whenever the user wants to pay out, disburse, withdraw, settle vendors or sellers, pay salaries, send money to a Nigerian bank account, buy airtime/data or pay utility bills through Nomba, or asks how to avoid double payments, handle a timed-out transfer, or when to refund a failed payout. Also use it to review or debug existing Nomba payout code.
---

# Nomba payouts

Outgoing money is where integration bugs cost the most. A transfer that times out may have gone through; retrying it with a fresh request pays twice. A transfer marked `PAYMENT_FAILED` may still succeed; refunding the customer then pays twice the other way. This skill covers transfers and bill payments so that every payout happens exactly once and failures are only acted on when they're final.

Use the official SDK on the server (`@nombaoss/nomba-node`, `nomba` for Python, `nombaoss/nomba-php`). **Read [references/sdk-setup.md](references/sdk-setup.md) before writing code**: it has the exact install, client, imports, error classes and webhook-verification call for each language. Credentials, sandbox defaults and error classes follow the nomba-integration skill; if it's available, use it too.

## The rule: one reference per payout, created before the call

Every transfer and bill purchase carries a `merchantTxRef`. Nomba uses it to reject duplicates, and you use it to find out what happened.

1. Derive the reference from your own data, deterministically: `payout-${withdrawal.id}`, `salary-${employee.id}-${month}`, `airtime-${order.id}`.
2. **Save it with the payout record (status `pending`) before calling Nomba.** If your process crashes mid-request, you can still look it up.
3. Pass it on the call, and reuse the **same** reference on any retry. Never generate a new one for a retry.

If you omit it, the SDK generates a UUID and returns it on the result, and attaches it to any error as `err.reference` (`$e->getReference()` in PHP). That's a safety net, not a design: you still need to store it.

## Bank transfers

1. **Look up the account name** with `transfers.lookupAccount({ accountNumber, bankCode })` (`lookup_account(account_number=..., bank_code=...)` in Python). Show it to the user to confirm before sending, and pass it as `accountName`. This catches typos that would send money to the wrong person. Bank codes come from `transfers.listBanks()`; cache them.
2. **Send** with `transfers.toBank({ amount, accountNumber, accountName, bankCode, merchantTxRef, narration })`. The amount is in naira.
3. **Read `status`** on the result: `SUCCESS` means delivered; `PENDING_BILLING` or `PROCESSING` means still in flight. Wait for the webhook or requery later. Don't mark it failed.

```ts
// Node.js / TypeScript
const ref = `payout-${withdrawal.id}`;
await db.payouts.create({ ref, amount, status: "pending" }); // stored before the call

const { accountName } = await nomba.transfers.lookupAccount({ accountNumber, bankCode });
try {
  const result = await nomba.transfers.toBank({
    amount, accountNumber, accountName, bankCode, merchantTxRef: ref, narration: "Withdrawal",
  });
  await db.payouts.update(ref, { status: result.status }); // SUCCESS, or PENDING_BILLING until the webhook
} catch (err) {
  if (err instanceof ConnectionError || err instanceof ServerError) {
    await db.payouts.update(ref, { status: "unknown" }); // reconcile: requery, never re-send blind
  } else {
    throw err; // ValidationError etc.: Nomba rejected it, nothing was sent
  }
}
```

```python
# Python
ref = f"payout-{withdrawal.id}"
db.payouts.create(ref=ref, amount=amount, status="pending")
who = nomba.transfers.lookup_account(account_number=account_number, bank_code=bank_code)
try:
    result = nomba.transfers.to_bank({
        "amount": amount, "accountNumber": account_number, "accountName": who["accountName"],
        "bankCode": bank_code, "merchantTxRef": ref, "narration": "Withdrawal",
    })
    db.payouts.update(ref, status=result["status"])
except (APIConnectionError, ServerError):  # APITimeoutError is an APIConnectionError
    db.payouts.update(ref, status="unknown")  # reconcile later by requery
```

```php
// PHP
$ref = "payout-{$withdrawal->id}";
$payouts->create($ref, $amount, 'pending');
$who = $nomba->transfers->lookupAccount(['accountNumber' => $accountNumber, 'bankCode' => $bankCode]);
try {
    $result = $nomba->transfers->toBank([
        'amount' => $amount, 'accountNumber' => $accountNumber, 'accountName' => $who['accountName'],
        'bankCode' => $bankCode, 'merchantTxRef' => $ref, 'narration' => 'Withdrawal',
    ]);
    $payouts->update($ref, $result['status']);
} catch (Nomba\Exception\ConnectionException|Nomba\Exception\ServerException $e) {
    $payouts->update($ref, 'unknown'); // TimeoutException is a ConnectionException
}
```

Wallet transfers to another Nomba account use `transfers.toWallet({ amount, receiverAccountId, merchantTxRef })` with the same rules. They don't return a `sessionId`, so reconcile them by `merchantTxRef`.

## Reconciling an unknown outcome

A timeout, connection error or 5xx on a money-moving call means **unknown**, not failed. The SDKs never retry these calls on their own. Resolve it by requery, from the request handler or (better) a reconciliation job that sweeps `pending`/`unknown` payouts:

1. `transactions.get({ merchantTxRef: ref })` (`get(merchant_tx_ref=ref)` in Python, `get(['merchantTxRef' => $ref])` in PHP).
2. Found: act on its `status` using the table below.
3. `NotFoundError`: Nomba never received it. Retry with the **same** reference.

## Status and webhooks: when is it final?

| Signal | Meaning | Do |
|---|---|---|
| `SUCCESS` / `payout_success` webhook | Delivered | Mark paid. |
| `PENDING_BILLING`, `PROCESSING` | In flight | Wait. |
| `PAYMENT_FAILED`, `REVERSED_BY_VENDOR` / `payout_failed` webhook | Nomba may still retry | Mark failing; **don't** refund or re-send yet. |
| `REFUND` / `payout_refund` webhook | Money is back in your Nomba wallet | Final failure: now refund or re-credit your customer, or re-send with a **new** reference if the business wants to try again. |
| `CANCELLED` | Won't proceed | Contact Nomba support before refunding. |

Webhooks carry the reference as `data.transaction.merchantTxRef`; match them to your payout record and update idempotently (see the nomba-webhooks skill for verification). Anything unlisted: requery or wait.

## Bill payments

All purchases take a `merchantTxRef` and follow the same rules as transfers. Validate the customer before paying, and show the returned name to the user to confirm:

| Bill | Look up first | Pay |
|---|---|---|
| Airtime | none | `bills.buyAirtime({ amount, phoneNumber, network })` |
| Data | `bills.listDataPlans(network)` | `bills.buyData({ productId, phoneNumber, network })` |
| Electricity | `bills.listElectricityProviders()`, `bills.lookupElectricityCustomer({ disco, customerId })` | `bills.buyElectricity({ disco, customerId, amount, meterType, payerName })` |
| Cable TV | `bills.listCableTvPlans(cableTvType)`, `bills.lookupCableTvCustomer({ customerId, cableTvType })` | `bills.payCableTv({ cableTvType, customerId, amount })` |
| Betting | `bills.listBettingProviders()`, `bills.lookupBettingCustomer({ providerId, customerId })` | `bills.fundBetting({ bettingProvider, customerId, amount })` |

Python uses snake_case method names with the same dict keys (`nomba.bills.buy_airtime({...})`); PHP uses the same names with arrays. For prepaid electricity, the meter token is in the result's `meta.phcnToken` when the status is `SUCCESS`; show it and store it, because the customer needs it to load the meter. If the status is `PENDING_BILLING`, the token comes later: requery by `merchantTxRef` rather than buying again.

## Batches and sub-accounts

- **Bulk payouts**: create all payout records with their references first, then send sequentially or with small concurrency. Nomba's default limit is 15 POST requests per second; on `RateLimitError`, back off and resume the same records. Don't loop with fresh references.
- Check `accounts.getBalance()` before a large batch so you don't half-run it.
- To pay from a sub-account, pass `{ subAccountId }` as the second argument (`sub_account_id=` in Python, `'subAccountId'` in the PHP options) instead of calling a different method.

## Checklist

- [ ] Every payout has a deterministic `merchantTxRef`, saved before the call and reused on retry.
- [ ] Bank transfers look up and confirm the account name first.
- [ ] Timeouts, connection errors and 5xx lead to requery or reconciliation, never a new request with a new reference.
- [ ] `PENDING_BILLING`/`PROCESSING`/`PAYMENT_FAILED` aren't treated as final.
- [ ] Customers are refunded only on `payout_refund` or a requery returning `REFUND`.
- [ ] Payout webhooks are verified and matched by `merchantTxRef`.
- [ ] Batches respect the rate limit and resume with the same references.
