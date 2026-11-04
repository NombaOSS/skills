---
name: nomba-checkout
description: >-
  Accept online payments with Nomba Checkout using the official SDKs (Node.js/TypeScript, Python, PHP) - creating a checkout order and redirecting to the hosted payment page, confirming the payment safely before giving value, saving cards for recurring billing and charging them later with OTP handling, and refunds. Use this whenever the user wants customers to pay through Nomba: "add Nomba payments/checkout", "payment link", "collect card or transfer payments", "subscriptions" or "charge a saved card" with Nomba, "pay with Nomba button", or e-commerce/order payment flows on a Nigerian site, even if they don't say "checkout". Also use it to review or debug an existing Nomba checkout flow.
---

# Nomba Checkout

Checkout is Nomba's hosted payment page: you create an order on your server, send the customer to the returned `checkoutLink`, and Nomba collects card, transfer or USSD payment. The part that goes wrong in practice isn't creating the order; it's deciding when the order is actually paid. A customer landing on your callback URL proves nothing, and fulfilling on it lets anyone get goods by visiting `/callback?orderReference=...`.

Use the official SDK on the server (`@nombaoss/nomba-node`, `nomba` for Python, `nombaoss/nomba-php`). **Read [references/sdk-setup.md](references/sdk-setup.md) before writing code**: it has the exact install, client, imports and webhook-verification call for each language. Credentials, sandbox defaults and error handling follow the nomba-integration skill; if it's available, use it too.

## The flow

1. **Create your order record first**, with your own reference (for example `order-${id}`), the amount and status `pending`. This reference is how you'll find the order again from the webhook and when verifying.
2. **Create the checkout order on the server**, passing your reference as `order.orderReference`, the amount, currency (`NGN`), the customer's email and a `callbackUrl`. The client secret never goes to the browser.
3. **Redirect to `checkoutLink`.**
4. **Confirm the payment** from the server, either:
   - on the `payment_success` webhook, verified with the SDK's verifier on the raw body (see [references/sdk-setup.md](references/sdk-setup.md) and the nomba-webhooks skill), matched by `data.order.orderReference`; or
   - when the customer returns to `callbackUrl`, by asking the API: `transactions.get({ orderReference })` and checking `status === "SUCCESS"`.

   Use both: the webhook is the reliable signal, and the callback check gives the customer an immediate answer. Make fulfilment idempotent, because both will fire.
5. **Check amount and currency** on the confirmed transaction match your order before marking it paid. Then fulfil once.

### Node.js / TypeScript

```ts
const order = await db.orders.create({ ref: `order-${cart.id}`, amount: cart.total, status: "pending" });

const { checkoutLink } = await nomba.checkout.createOrder({
  order: {
    orderReference: order.ref,
    amount: order.amount.toFixed(2), // naira, as a string: "15000.00"
    currency: "NGN",
    customerEmail: user.email,
    callbackUrl: `${BASE_URL}/checkout/callback`,
  },
});
res.redirect(checkoutLink);

// Callback route: never trust the query string alone.
const tx = await nomba.transactions.get({ orderReference: order.ref });
if (tx.status === TransactionStatus.SUCCESS && Number(tx.amount) === order.amount) {
  await fulfilOnce(order.ref); // idempotent; the webhook may already have done it
}
```

### Python

```python
order_ref = f"order-{cart.id}"
result = nomba.checkout.create_order({
    "order": {
        "orderReference": order_ref,
        "amount": f"{cart.total:.2f}",
        "currency": "NGN",
        "customerEmail": user.email,
        "callbackUrl": f"{BASE_URL}/checkout/callback",
    }
})
return redirect(result["checkoutLink"])

tx = nomba.transactions.get(order_reference=order_ref)
if tx["status"] == TransactionStatus.SUCCESS:
    fulfil_once(order_ref)
```

### PHP

```php
$order = $nomba->checkout->createOrder([
    'order' => [
        'orderReference' => $orderRef,
        'amount' => number_format($total, 2, '.', ''),
        'currency' => 'NGN',
        'customerEmail' => $user->email,
        'callbackUrl' => "$baseUrl/checkout/callback",
    ],
]);
header('Location: ' . $order['checkoutLink']);

$tx = $nomba->transactions->get(['orderReference' => $orderRef]);
if (($tx['status'] ?? null) === Nomba\TransactionStatus::SUCCESS) {
    fulfilOnce($orderRef);
}
```

Exact method signatures for each SDK are in their READMEs (linked from the nomba-integration skill).

### Two references, easy to mix up

- `order.orderReference`: **yours**, sent when creating the order. Use it everywhere in your code.
- `data.orderReference` in the create-order response: Nomba's order ID (`orderId`), despite the name. Store it for support, but look orders up by your own reference.

`checkout.getTransaction({ idType, id })` gives full card and transfer details but works in **production only**; for confirming payment use `transactions.get({ orderReference })`, which works in both environments.

### Splits and sub-accounts

To settle into a sub-account (outlet), put its `accountId` inside the `order` object. To split a payment, add `splitRequest` to the order. Check the field shapes in the OpenAPI spec before using them.

## Saved cards (recurring payments)

1. First payment: create the order with `tokenizeCard: true` (only when you'll charge again; it's a consent question for the customer).
2. On the `payment_success` webhook, **verify the signature first** with the SDK's verifier (`verifyWebhook` / `verify_signature` / `Webhook::verify`, see [references/sdk-setup.md](references/sdk-setup.md) and the nomba-webhooks skill). Never store a token from an unverified request: a forged webhook could plant an attacker's card on a customer. Then read `data.tokenizedCardData.tokenKey`. If it's missing or `"N/A"`, the token wasn't ready; it arrives on a later webhook. Store it **server-side only** with the customer, the email it was saved with, the card type, last 4 digits and expiry. Don't log it or send it to the browser.
3. Later charges: `checkout.chargeSavedCard({ tokenKey, order: { orderReference, amount, currency, customerEmail, callbackUrl } })`. The `customerEmail` must be the one the card was saved with, or Nomba rejects the charge.
4. If the result has `otpRequired`, collect the OTP from the customer and call `checkout.submitCardOtp({ otp, orderReference, transactionId })`.
5. Confirm the charge the same way as a first payment (webhook or `transactions.get`) before giving value.

The charge's idempotency key is `order.orderReference`. Generate it from your billing period (`sub-${subscriptionId}-${period}`), store it before charging, and reuse it if you retry. The SDKs never retry a charge on their own. On a timeout, the error carries the reference (`err.reference`, or `$e->getReference()` in PHP); requery it before charging again, or you risk charging the customer twice.

Other saved-card methods: `listSavedCards`, `updateSavedCardEmail`, `deleteSavedCard`. Building your own card form instead of the hosted page (`submitCardDetails`, `submitCardOtp`, `resendOtp`) brings PCI scope; prefer the hosted page unless the user explicitly needs it.

## Refunds

`checkout.refund({ transactionId })` refunds in full; add `amount` for a partial refund, or `accountNumber` and `bankCode` to refund to a bank account. Refunds work in **production only**. Record the refund against your order and don't refund twice: treat it like any other money-moving call, so a timeout leads to a status check, not a blind retry.

## Checklist

- [ ] The order is created server-side with your own `orderReference`, stored before redirecting.
- [ ] Nothing is fulfilled from the callback URL or query string alone; payment is confirmed by verified webhook or `transactions.get`.
- [ ] Amount and currency are checked against the order; fulfilment is idempotent.
- [ ] The amount is sent in naira (for example `"15000.00"`), not kobo.
- [ ] Card tokens are stored server-side with the email they were saved with, never logged or sent to the client.
- [ ] Saved-card charges use a stored, deterministic `order.orderReference`, and timeouts lead to a requery, not a second charge.
- [ ] Refund and `getTransaction` code paths remember they're production-only.
