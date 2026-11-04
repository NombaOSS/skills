# Node.js / TypeScript SDK reference (@nombaoss/nomba-node)

Written against @nombaoss/nomba-node 0.1.2. Install with `npm install @nombaoss/nomba-node`. Source and full README: https://github.com/NombaOSS/nomba-node

Contents: [Quickstart](#quickstart) · [Configuration](#configuration) · [Resources](#resources) · [Errors](#errors) · [Retries and idempotency](#retries-and-idempotency) · [Transaction statuses](#transaction-statuses) · [Pagination](#pagination) · [Webhooks](#webhooks) · [Token store](#token-store) · [Sandbox and production](#sandbox-and-production)

Read the section you need; the money-safety rules in SKILL.md apply on top of this.

## Quickstart

```ts
import Nomba from "@nombaoss/nomba-node";

const nomba = new Nomba({
  clientId: process.env.NOMBA_CLIENT_ID,
  clientSecret: process.env.NOMBA_CLIENT_SECRET,
  accountId: process.env.NOMBA_ACCOUNT_ID, // your parent account ID
}); // sandbox by default

const balance = await nomba.accounts.getBalance();
console.log(balance.amount, balance.currency);
```

CommonJS: `const { Nomba } = require("@nombaoss/nomba-node");`

Get sandbox credentials from your Nomba dashboard. More examples are in [`examples/`](https://github.com/NombaOSS/nomba-node/blob/main/examples).

## Configuration

| Option         | Default                                   | Notes                                                                                       |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `clientId`     | env `NOMBA_CLIENT_ID`                     | Required.                                                                                   |
| `clientSecret` | env `NOMBA_CLIENT_SECRET`                 | Required.                                                                                   |
| `accountId`    | env `NOMBA_ACCOUNT_ID`                    | Required. Parent account ID, sent as the `accountId` header on every request.               |
| `environment`  | env `NOMBA_ENVIRONMENT`, else `"sandbox"` | `"sandbox"` (`https://sandbox.nomba.com`) or `"production"` (`https://api.nomba.com`).      |
| `baseUrl`      | from `environment`                        | Override for proxies and tests. Must be `https://`, except for `localhost` and `127.0.0.1`. |
| `timeout`      | `30000`                                   | Per-request timeout in milliseconds.                                                        |
| `maxRetries`   | `2`                                       | Automatic retries for GET and token requests. See [Retries](#retries).                      |
| `tokenStore`   | in memory                                 | See [Token store](#token-store).                                                            |
| `fetch`        | global `fetch`                            | Custom `fetch` implementation.                                                              |

A missing credential throws a `ConfigurationError` at construction that names the option and the environment variable. The constructor makes no network calls; the first API call gets the access token.

Every method returns the response's `data` field. The `{ code, description, data }` envelope is unwrapped for you.

## Resources

### Accounts

```ts
const parent = await nomba.accounts.getParent();
const balance = await nomba.accounts.getBalance(); // parent account
const subBalance = await nomba.accounts.getBalance({ subAccountId: "..." });
const sub = await nomba.accounts.getSubAccount({ accountRef: "store-12" });
const page = await nomba.accounts.listTerminals({ limit: 20 });
```

Methods that act on a sub account take an optional `subAccountId` instead of having separate methods.

### Virtual accounts

```ts
const va = await nomba.virtualAccounts.create({
  accountRef: "order-881",
  accountName: "Ada Obi",
});
await nomba.virtualAccounts.get("order-881");
await nomba.virtualAccounts.update("order-881", { accountName: "Ada N. Obi" });
await nomba.virtualAccounts.expire("order-881");
const page = await nomba.virtualAccounts.list({ expired: false }, { limit: 50 });
```

### Checkout

```ts
const { checkoutLink, orderReference } = await nomba.checkout.createOrder({
  order: {
    amount: 5000,
    currency: "NGN",
    customerEmail: "customer@example.com",
    callbackUrl: "https://example.com/checkout/done",
  },
  tokenizeCard: true,
});

const tx = await nomba.checkout.getTransaction({
  idType: "ORDER_REFERENCE",
  id: orderReference,
});

// Later: charge the saved card using the token from the payment_success webhook.
const charge = await nomba.checkout.chargeSavedCard({
  order: {
    amount: 5000,
    currency: "NGN",
    customerEmail: "customer@example.com",
    callbackUrl: "https://example.com/cb",
  },
  tokenKey: "token-from-webhook",
});
if (charge.otpRequired) {
  await nomba.checkout.submitCardOtp({
    otp: "123456",
    orderReference: charge.orderReference!,
    transactionId: charge.transactionId!,
  });
}
```

Also: `getOrder`, `cancelOrder`, `refund`, `listSavedCards`, `updateSavedCardEmail`, `deleteSavedCard`, `getTransferAccount`, `submitCardDetails`, `resendOtp`, `confirmTransactionReceipt`, `cancelTransaction`, `requestSaveCardOtp`, `requestSavedCardsOtp`, `submitUserOtp` and `getSavedCards`.

### Transfers

```ts
const banks = await nomba.transfers.listBanks();
const { accountName } = await nomba.transfers.lookupAccount({
  accountNumber: "0123456789",
  bankCode: "058",
});

const transfer = await nomba.transfers.toBank({
  amount: 1000,
  accountNumber: "0123456789",
  accountName: accountName!,
  bankCode: "058",
  narration: "Invoice 42",
  merchantTxRef: "invoice-42-payout", // your idempotency reference
});

await nomba.transfers.toWallet({ amount: 500, receiverAccountId: "..." });
```

### Transactions

```ts
const page = await nomba.transactions.list({
  limit: 50,
  dateFrom: "2026-01-01T00:00:00",
});
const filtered = await nomba.transactions.filter({ status: "SUCCESS" }, { limit: 20 });
const tx = await nomba.transactions.get({ merchantTxRef: "invoice-42-payout" });
const credits = await nomba.transactions.listBankTransactions();
const bySession = await nomba.transactions.requery("100004250929105143781234567890");
```

`transactions.get` needs exactly one of `transactionRef`, `merchantTxRef`, `orderReference` or `orderId`.

### Terminals

```ts
await nomba.terminals.assign({ serialNumber: "SN123", terminalLabel: "Till 1" });
await nomba.terminals.unassign({ serialNumber: "SN123" });
await nomba.terminals.sendPaymentRequest("2KUD0001", {
  merchantTxRef: "till-1-0042",
  amount: 2500,
  currency: "NGN",
});
```

### Direct debits

```ts
const mandate = await nomba.directDebits.createMandate({
  /* customer, amount, frequency, dates */ ...mandateDetails,
});
await nomba.directDebits.getMandateStatus(mandate.mandateId);
await nomba.directDebits.debitMandate({ mandateId: mandate.mandateId, amount: "5000" });
await nomba.directDebits.listMandates({ page: 1, pageSize: 20 });
await nomba.directDebits.updateMandateStatus({
  mandateId: mandate.mandateId,
  status: "SUSPEND",
});
```

### Bills

```ts
await nomba.bills.buyAirtime({ amount: 500, phoneNumber: "08012345678", network: "MTN" });
const plans = await nomba.bills.listDataPlans("mtn");
await nomba.bills.buyData({
  productId: plans[0]!.productId!,
  phoneNumber: "08012345678",
  network: "MTN",
});

const customer = await nomba.bills.lookupElectricityCustomer({
  disco: "IKEDC",
  customerId: "45012345678",
});
await nomba.bills.buyElectricity({
  disco: "IKEDC",
  customerId: "45012345678",
  amount: 5000,
  meterType: "PREPAID",
  payerName: customer.name,
});

await nomba.bills.lookupCableTvCustomer({
  customerId: "7034512345",
  cableTvType: "dstv",
});
await nomba.bills.payCableTv({
  cableTvType: "dstv",
  customerId: "7034512345",
  amount: 15700,
});

await nomba.bills.lookupBettingCustomer({ providerId: "bet9ja", customerId: "12345" });
await nomba.bills.fundBetting({
  bettingProvider: "bet9ja",
  customerId: "12345",
  amount: 1000,
});
```

Also: `listElectricityProviders`, `listCableTvPlans` and `listBettingProviders`. Purchases use the v2 endpoints.

### Global payout

```ts
const rates = await nomba.globalPayout.getExchangeRates({ from: "NGN", to: "USD" });
const methods = await nomba.globalPayout.listPaymentMethods({
  destinationCurrency: "CAD",
});
const quote = await nomba.globalPayout.convertMoney({
  amount: 100000,
  currency: "NGN",
  destinationCurrency: "CAD",
  transactionType: "SELL",
});
const payout = await nomba.globalPayout.authorizeTransfer({
  ...transferDetails,
  lockedExchangeRateId: quote.exchangeRateId,
  idempotencyKey: "payout-77",
});
await nomba.globalPayout.getTransaction(payout.wtTransactionId!);
```

Also: `listAccounts`, `getAccount`, `listBankProviders` and `authorizeExchange`. In the sandbox, `listAccounts` and `getAccount` use Nomba's `/v1/sandbox/global-payout/accounts` paths automatically.

### Global collection

```ts
const providers = await nomba.globalCollection.listDrcProviders();
const inflow = await nomba.globalCollection.initiateInflow({
  phoneNumber: "243810000000",
  amount: 10,
  currency: "USD",
  topupVendor: providers[0]!.code!,
  callbackUrl: "https://example.com/inflow",
  idempotencyKey: "inflow-9",
});
await nomba.globalCollection.getTransaction(inflow.transactionReference!);
```

### Auth

```ts
await nomba.auth.revoke(); // revokes the current access token and clears the token store
```

## Errors

Every error extends `NombaError`.

| Class                      | When                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ApiError`                 | A 2xx response with a non-success `code`, or an HTTP error not listed below. Parent of the next six. |
| `AuthenticationError`      | 401 after the automatic re-authentication, or the token request was rejected.                        |
| `PermissionDeniedError`    | 403.                                                                                                 |
| `NotFoundError`            | 404.                                                                                                 |
| `ValidationError`          | 400, 422, or bad input caught before sending (`httpStatus` is `null`).                               |
| `RateLimitError`           | 429. `retryAfter` (seconds) and `rateLimit` (`X-Rate-Limit-*` headers).                              |
| `ServerError`              | 5xx.                                                                                                 |
| `ConnectionError`          | Network failure.                                                                                     |
| `TimeoutError`             | The request timed out (extends `ConnectionError`).                                                   |
| `WebhookVerificationError` | A webhook failed verification.                                                                       |
| `ConfigurationError`       | Missing or invalid client options.                                                                   |

`ApiError` has `httpStatus`, `code`, `description` (Nomba's message), `body` (the parsed response), `method` and `path`:

```ts
import { ApiError, RateLimitError } from "@nombaoss/nomba-node";

try {
  await nomba.transfers.toBank(params);
} catch (err) {
  if (err instanceof RateLimitError) console.log(`retry in ${err.retryAfter}s`);
  else if (err instanceof ApiError) console.log(err.message);
  // Nomba API error 400 (code "400"): Invalid bank code [POST /v2/transfers/bank]
  else throw err;
}
```

Errors never contain your client secret, tokens, request headers or query strings.

## Retries and idempotency

### Retries

GET requests and token requests are retried automatically on connection errors, timeouts, 429 and 5xx responses, up to `maxRetries` times (default 2). The delay starts at 0.5 s and doubles each time (1 s, 2 s, up to 8 s), with jitter. On a 429 the SDK waits for `Retry-After` (up to 60 s).

**POST, PUT and DELETE are never retried automatically.** A timeout or a 5xx on a transfer does not tell you whether Nomba moved the money. Retrying blindly could pay twice. The one exception: after a 401, the SDK gets a new token and retries the request once, because Nomba rejected it before processing it.

### Idempotency with `merchantTxRef`

`transfers.toBank`, `transfers.toWallet` and every `bills` purchase send a `merchantTxRef`. If you don't pass one, the SDK generates a random UUID v4 and adds it to the result:

```ts
const t = await nomba.transfers.toWallet({ amount: 500, receiverAccountId: "..." });
console.log(t.merchantTxRef); // "3b241101-e2bb-4255-8caf-4136c566a962"
```

If the call throws, the error carries the reference that was sent, generated or yours, as `err.reference` (`{ field: "merchantTxRef", value }`). After a `TimeoutError`, `ConnectionError` or `ServerError` you don't know whether the money moved. Requery with `err.reference.value` before you retry, and retry only with the same reference:

```ts
import { NombaError, TransactionStatus } from "@nombaoss/nomba-node";

try {
  await nomba.transfers.toBank(details);
} catch (err) {
  if (!(err instanceof NombaError) || !err.reference) throw err;
  // Outcome unknown: check first.
  const tx = await nomba.transactions.get({ merchantTxRef: err.reference.value });
  if (tx.status !== TransactionStatus.SUCCESS) {
    // Not delivered yet: wait for the webhook, or retry with the SAME reference.
    // nomba.transfers.toBank({ ...details, merchantTxRef: err.reference.value })
  }
}
```

(`transactions.get` throws `NotFoundError` if Nomba never received the transfer; then retrying with the same reference is safe.)

Better still: pass your own reference and store it before you send, so you can check the outcome even if your process crashes mid-request. Nomba deduplicates on it:

```ts
const merchantTxRef = `payout-${invoice.id}`;
await nomba.transfers.toBank({ ...details, merchantTxRef });
```

`checkout.chargeSavedCard` has no `merchantTxRef` field; its reference is `order.orderReference`. The SDK generates that one the same way when you omit it, returns it as `orderReference`, and sets `err.reference` to `{ field: "orderReference", value }` on errors. Global payout and collection calls take an `idempotencyKey`, which you set yourself.

## Transaction statuses

The SDK returns `data.status` as-is and never throws because of it. Check it yourself. The values are exported as `TransactionStatus`:

| `TransactionStatus`  | What happened                        | Refund your customer? |
| -------------------- | ------------------------------------ | --------------------- |
| `SUCCESS`            | Service delivered to the destination | No                    |
| `REFUND`             | Funds returned to your Nomba wallet  | Yes                   |
| `CANCELLED`          | The transaction will not proceed     | Contact support       |
| `PAYMENT_FAILED`     | Debit failed; Nomba may retry        | Wait for the webhook  |
| `REVERSED_BY_VENDOR` | Nomba may retry via another vendor   | Wait for the webhook  |
| `PENDING_BILLING`    | Still processing                     | Wait for the webhook  |
| `PROCESSING`         | Still processing (v1 endpoints)      | Wait for the webhook  |

If you get a status that isn't listed, requery or wait for a webhook. Only refund on a `payout_refund` webhook or a requery that returns `REFUND`. Source: [Response codes](https://developer.nomba.com/docs/api-basics/response-codes).

## Pagination

List endpoints return one page: `{ results, cursor }`. An empty or missing `cursor` means it's the last page. `limit` can be 1 to 50.

```ts
const page = await nomba.transactions.list({ limit: 50 });
const next = await nomba.transactions.list({ limit: 50, cursor: page.cursor });
```

The auto-pagers fetch pages as you iterate:

```ts
for await (const tx of nomba.transactions.listAll({ dateFrom: "2026-01-01T00:00:00" })) {
  console.log(tx.id, tx.amount);
}
```

| Page method                         | Auto-pager                             |
| ----------------------------------- | -------------------------------------- |
| `transactions.list`                 | `transactions.listAll`                 |
| `transactions.filter`               | `transactions.filterAll`               |
| `transactions.listBankTransactions` | `transactions.listAllBankTransactions` |
| `accounts.listTerminals`            | `accounts.listAllTerminals`            |
| `virtualAccounts.list`              | `virtualAccounts.listAll`              |

`checkout.listSavedCards` and `directDebits.listMandates` use page numbers (`page`, `nextPage` / `hasMore`) instead.

## Webhooks

`verifyWebhook(rawBody, headers, signingKey)` checks the `nomba-signature` header and returns the parsed event, or throws `WebhookVerificationError`. Webhook handlers don't need API credentials, so it works without a client. It is also available as `Nomba.webhooks.verify` and `nomba.webhooks.verify`.

```ts
import express from "express";
import { verifyWebhook, WebhookEventType } from "@nombaoss/nomba-node";

const app = express();

app.post("/webhooks/nomba", express.raw({ type: "*/*" }), (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers, process.env.NOMBA_WEBHOOK_SIGNING_KEY!);
  } catch {
    return res.sendStatus(401);
  }
  if (event.event_type === WebhookEventType.PAYMENT_SUCCESS) {
    // fulfil the order; deduplicate on event.requestId
  }
  res.sendStatus(200);
});
```

**Pass the raw body.** Use `express.raw()` (or `await request.text()` with the Fetch API), not `express.json()`. If the body is parsed and serialised again, it can change and the signature will not match. `rawBody` can be a string, `Buffer`, `Uint8Array` or `ArrayBuffer`. `headers` can be Node's `req.headers` or a Fetch `Headers` object.

- The signature is compared exactly (base64 is case-sensitive) and in constant time. Surrounding whitespace in the header is ignored.
- `nomba-sig-value` is accepted if `nomba-signature` is absent. A `nomba-signature-algorithm` other than `HmacSHA256` is rejected.
- `nomba-timestamp` must be an RFC 3339 time (for example `2025-09-29T10:51:44Z`), and a `responseCode` containing `:` is rejected. Both checks stop a forged webhook from moving part of the timestamp into the signed body.
- `toleranceSeconds` rejects events whose `nomba-timestamp` is more than that many seconds from now. Leave it off (the default): see below.

**Replay protection.** Deduplicating on the signed `event.requestId` is the main defence: a replayed or retried delivery of an event you've already processed changes nothing. Nomba documents `nomba-timestamp` as the time the payload was sent, without saying whether automatic retries get a fresh one. If they keep the original, a short tolerance would reject legitimate retries after an outage. Only enable `toleranceSeconds` after confirming in the sandbox that redeliveries carry a new timestamp, and then keep it generous (for example an hour) with server clocks synced.

**Confirm money decisions with the API.** The signature doesn't cover the amount, `orderReference`, `merchantTxRef` or the card `tokenKey`. Before you fulfil, refund or store a card token, requery with `transactions.get` (`{ orderReference }` for checkout payments, `{ merchantTxRef }` for payouts) and act on its answer.

Event types are exported as `WebhookEventType`: `payment_success`, `payment_failed`, `payment_reversal`, `payout_success`, `payout_failed`, `payout_refund`. Verification uses `node:crypto`, so it works in Node, Bun, Deno and edge runtimes with Node compatibility enabled.

## Token store

Nomba access tokens last about 30 minutes. The SDK refreshes them 5 minutes before they expire, and concurrent requests share a single token request. By default each client keeps its token in memory.

If you run several instances, Nomba recommends that one token is shared rather than each instance authenticating. Pass a `tokenStore` with `get` and `set` (both may be async):

```ts
import Nomba, { type Token, type TokenStore } from "@nombaoss/nomba-node";

const redisStore: TokenStore = {
  async get() {
    const v = await redis.get("nomba:token");
    return v ? (JSON.parse(v) as Token) : null;
  },
  async set(token) {
    if (token) await redis.set("nomba:token", JSON.stringify(token));
    else await redis.del("nomba:token");
  },
};

const nomba = new Nomba({ tokenStore: redisStore });
```

A `Token` is `{ accessToken, refreshToken, expiresAt }`. Treat the store as a secret.

## Sandbox and production

The client uses the sandbox unless you set `environment: "production"` (or `NOMBA_ENVIRONMENT=production`), so you can't reach production by accident. Sandbox and production use different credentials. Any value other than `sandbox` or `production` throws a `ConfigurationError`.
