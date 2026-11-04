---
name: nomba-webhooks
description: >-
  Build a secure Nomba webhook endpoint that verifies the signature, deduplicates deliveries and acts correctly on each event (payment_success, payment_failed, payment_reversal, payout_success, payout_failed, payout_refund). Use this whenever the user wants to receive, handle, verify or debug Nomba webhooks or "notifications"/"callbacks" from Nomba, in Express, Next.js, NestJS, Fastify, Flask, FastAPI, Django, Laravel, Symfony or plain PHP, including when they only say "confirm the payment on my server", "listen for successful transfers" or paste a payload with event_type and nomba-signature headers. Use it also when reviewing an existing webhook handler.
---

# Nomba webhooks

A webhook is how Nomba tells your server that money actually moved. Anyone on the internet can POST to your webhook URL, so the handler has to prove each request came from Nomba before it marks an order paid or refunds anyone. It also has to cope with Nomba retrying the same event.

Use the official SDK's verifier; don't hand-roll the HMAC. Nomba's signature covers specific fields joined with `:`, and the SDKs also block a replay trick that a naive implementation misses.

| Language | Verify |
|---|---|
| Node.js / TS (`@nombaoss/nomba-node`) | `verifyWebhook(rawBody, headers, signingKey)` |
| Python (`nomba`) | `from nomba.webhooks import verify_signature` → `verify_signature(raw_body, headers, signing_key)` |
| PHP (`nombaoss/nomba-php`) | `Nomba\Webhook::verify($rawBody, $headers, $signingKey)` |

Exact imports and argument types for each language are in [references/sdk-setup.md](references/sdk-setup.md). Each returns the parsed event or throws (`WebhookVerificationError` / `WebhookVerificationException`). None of them need API credentials, only the webhook **signing key** from the Nomba dashboard (Developer → Webhook Setup). Read it from an environment variable such as `NOMBA_WEBHOOK_SIGNING_KEY`. It's a different secret from the API client secret.

## The handler, step by step

1. **Get the raw body.** Verify the exact bytes Nomba sent. If a JSON body parser runs first and you re-serialise the object, the signature can stop matching, or worse, you end up verifying something other than what you act on. Every framework has a different way to get the raw body; see [references/frameworks.md](references/frameworks.md) for the right one, and exclude the route from CSRF protection where the framework has it.
2. **Verify, then parse.** Use the event the verifier returns. On failure, respond `401` (or `400`) and stop. Don't log the full body or headers of rejected requests at info level.
3. **Deduplicate on `requestId`.** Nomba retries deliveries, so the same event can arrive more than once. Record each processed `requestId` with a unique constraint and skip ones you've seen. Return `200` for duplicates too, or Nomba keeps retrying.
4. **Acknowledge fast.** Return `200` promptly and do slow work (emails, fulfilment, ledger updates) in a background job keyed by `requestId`. Slow handlers cause timeouts and redeliveries.
5. **Act on the event** using the table below. Match the event to your own record by reference, and check that the amount and currency match what you expected before fulfilling.

## What each event means

| `event_type` | Match on | Do |
|---|---|---|
| `payment_success` | checkout: `data.order.orderReference`; virtual account / transfer in: `data.transaction.aliasAccountReference` or `transactionId` | Mark paid after checking `data.transaction.transactionAmount` (and currency) against your order. For tokenized checkouts, store `data.tokenizedCardData.tokenKey` (if it's present and not `"N/A"`) with the customer, server-side only. |
| `payment_failed` | same as above | Mark the attempt failed; let the customer retry. Nothing was charged. |
| `payment_reversal` | same as above | Money you received was reversed. Undo fulfilment or flag for review. |
| `payout_success` | `data.transaction.merchantTxRef` | Mark the transfer or bill payment delivered. |
| `payout_failed` | `data.transaction.merchantTxRef` | **Don't refund yet.** Nomba may retry through another route. Mark it as failing and wait. |
| `payout_refund` | `data.transaction.merchantTxRef` | The money is back in your Nomba wallet. Now it's safe to refund or credit your customer and mark the payout failed. |

Refunding on `payout_failed` (or on a timeout) instead of `payout_refund` is the classic way merchants pay customers twice. For any event you don't recognise, log it and return `200`.

For high-value fulfilment, you can confirm before acting: requery the transaction with the SDK (`checkout.getTransaction` for checkout orders, `transactions.get({ merchantTxRef })` for payouts) and act on the API's answer.

## Replay protection

Deduplicating on `requestId` is the main defence: a replayed or retried delivery of an event you've already processed changes nothing.

The verifiers can also reject old timestamps (`toleranceSeconds` / `tolerance_seconds` / the fourth argument in PHP), but leave this off by default. Nomba documents `nomba-timestamp` as the time the payload was sent, without saying whether automatic retries get a fresh one. If they keep the original, a tolerance shorter than Nomba's retry window would reject legitimate retries after an outage, and paid orders would never be confirmed. Only enable it after confirming in the sandbox that redeliveries carry a new timestamp, and then keep it generous (for example an hour) with server clocks synced.

## Example (Node.js + Express)

```ts
import express from "express";
import { verifyWebhook, WebhookEventType } from "@nombaoss/nomba-node";

const app = express();

// Raw body for this route only; register it before any app-wide express.json().
app.post("/webhooks/nomba", express.raw({ type: "*/*" }), async (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers, process.env.NOMBA_WEBHOOK_SIGNING_KEY!);
  } catch {
    return res.sendStatus(401);
  }

  // Unique constraint on request_id; returns false if we've seen it.
  const isNew = await webhookEvents.recordOnce(event.requestId, event.event_type);
  if (isNew) await jobs.enqueue("nomba-webhook", event); // process in the background
  res.sendStatus(200);
});
```

Python (Flask/FastAPI/Django), PHP (Laravel/plain) and other Node frameworks are in [references/frameworks.md](references/frameworks.md).

## Testing

- Unit-test the handler with the SDK's documented test vector: body from the SDK's `webhook-fixture.json`, key `SampleSignatureKey123`, header `nomba-timestamp: 2025-09-29T10:51:44Z`, `nomba-signature: q30yFZDyykoymBf9+mt1wz5UAuLk57raPGPHlGzIv00=`. Assert that a wrong key, a tampered body and missing headers are rejected, and that a duplicate `requestId` is processed once.
- End to end: set a test webhook URL and signing key in the dashboard, expose your local server with a tunnel, and make sandbox payments. The dashboard can re-push or debug deliveries (https://developer.nomba.com/docs/api-basics/troubleshoot-webhooks).

## Checklist

- [ ] Raw body is verified with the SDK, before any parsing or business logic.
- [ ] Signing key comes from the environment, not code.
- [ ] Bad signatures get 401/400; nothing else happens.
- [ ] `requestId` is deduplicated with a unique constraint; duplicates still get 200.
- [ ] Heavy work runs in the background; the handler returns 200 quickly.
- [ ] Amount and currency are checked against the order before fulfilling.
- [ ] Refunds happen only on `payout_refund` (or a requery returning `REFUND`).
- [ ] The route is excluded from CSRF protection and uses HTTPS.
