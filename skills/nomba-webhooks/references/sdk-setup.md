# Nomba SDK setup

Exact install, client, import and webhook-verification code for the official SDKs. Use these names as written; don't guess constructor options or class names.

Contents: [Node.js / TypeScript](#nodejs--typescript) · [Python](#python) · [PHP](#php) · [Shared behaviour](#shared-behaviour) · [Field names](#field-names)

## Node.js / TypeScript

```bash
npm install @nombaoss/nomba-node   # Node 18+, no dependencies
```

```ts
import Nomba, {
  ApiError, ConnectionError, TimeoutError, ServerError, NotFoundError,
  RateLimitError, ValidationError, WebhookVerificationError,
  TransactionStatus, WebhookEventType, verifyWebhook,
} from "@nombaoss/nomba-node";

// Reads NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID (and NOMBA_ENVIRONMENT) from the environment.
// Sandbox by default; pass { environment: "production" } or set NOMBA_ENVIRONMENT=production for live.
export const nomba = new Nomba();
```

- `TimeoutError` extends `ConnectionError`; both mean "unknown outcome" on money-moving calls.
- Errors from money-moving calls carry `err.reference` (`{ field, value }`).
- Webhooks: `verifyWebhook(rawBody, headers, signingKey, { toleranceSeconds: 300 })` returns the event or throws `WebhookVerificationError`. `rawBody` is the unparsed string or Buffer; `headers` can be Node's `req.headers` or a Fetch `Headers`. It uses `node:crypto` (on Next.js, set `export const runtime = "nodejs"`).

## Python

```bash
pip install nomba   # Python 3.10+, depends only on httpx
```

```python
from nomba import (
    Nomba, AsyncNomba,
    ApiError, APIConnectionError, APITimeoutError, ServerError, NotFoundError,
    RateLimitError, ValidationError, WebhookVerificationError,
    TransactionStatus, WebhookEventType,
)
from nomba.webhooks import verify_signature

# Reads NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID (and NOMBA_ENVIRONMENT) from the environment.
nomba = Nomba()              # sync; use one per process
# async: async with AsyncNomba() as nomba: ...
```

- Method names are snake_case (`transfers.to_bank`, `checkout.create_order`), request bodies are dicts with Nomba's camelCase keys, and lookups take keyword arguments (`transactions.get(merchant_tx_ref=ref)`, `transactions.get(order_reference=ref)`). Sub-accounts: `sub_account_id=` keyword.
- `APITimeoutError` is an `APIConnectionError`; both mean "unknown outcome" on money-moving calls. Errors from those calls carry `err.reference` (`.field`, `.value`).
- Webhooks: `verify_signature(raw_body, headers, signing_key, tolerance_seconds=300)` returns the event dict or raises `WebhookVerificationError`. `raw_body` is bytes or str (`request.get_data()` in Flask, `await request.body()` in FastAPI, `request.body` in Django).

## PHP

```bash
composer require nombaoss/nomba-php   # PHP 8.1+, depends only on Guzzle 7
```

```php
use Nomba\Nomba;
use Nomba\Webhook;
use Nomba\TransactionStatus;
use Nomba\WebhookEventType;
use Nomba\Exception\{ApiException, ConnectionException, TimeoutException, ServerException,
    NotFoundException, RateLimitException, ValidationException, WebhookVerificationException};

// Reads NOMBA_CLIENT_ID, NOMBA_CLIENT_SECRET, NOMBA_ACCOUNT_ID (and NOMBA_ENVIRONMENT) from the environment
// when the options are omitted. Sandbox by default; 'environment' => 'production' for live.
$nomba = new Nomba();
```

- Parameters and results are arrays with Nomba's camelCase keys (`$nomba->transfers->toBank([...])`). Sub-accounts: a second argument `['subAccountId' => $id]`.
- `TimeoutException` extends `ConnectionException`; both mean "unknown outcome" on money-moving calls. Exceptions from those calls carry `$e->getReference()` (`->field`, `->value`).
- Webhooks: `Webhook::verify($rawBody, $headers, $signingKey, 300)` returns the event array or throws `WebhookVerificationException`. `$rawBody` is `file_get_contents('php://input')` or `$request->getContent()` in Laravel; headers can be `getallheaders()`, Laravel/Symfony `$request->headers->all()`, PSR-7 `getHeaders()` or `$_SERVER`.
- In Laravel, bind one client in a service provider: `$this->app->singleton(Nomba::class, fn () => new Nomba());`.

## Shared behaviour

- Every method returns the `data` of Nomba's response envelope. Transaction state is in `status`; compare it with `TransactionStatus::SUCCESS` / `TransactionStatus.SUCCESS`.
- GETs and token calls are retried automatically; POST/PUT/DELETE never are.
- The webhook verifier also rejects a `nomba-timestamp` that isn't strict RFC 3339 and a `responseCode` containing `:`, which blocks a replay forgery that a hand-written HMAC check misses. Prefer it over hand-rolled verification.
- The webhook signing key (dashboard → Developer → Webhook Setup) is a different secret from the API client secret; read it from its own environment variable, e.g. `NOMBA_WEBHOOK_SIGNING_KEY`.

## Field names

Use these instead of guessing. Amounts are in **naira** (not kobo) everywhere.

| Where | Fields |
|---|---|
| `checkout.createOrder` body | `{ order: { orderReference, amount, currency, customerEmail, callbackUrl, customerId?, accountId?, splitRequest? }, tokenizeCard? }`. `tokenizeCard` is top-level, next to `order`, not inside it. Result: `checkoutLink`, `orderReference` (Nomba's order ID). |
| `checkout.chargeSavedCard` result | `status`, `message`, `orderId`, `orderReference`, `otpRequired`, `transactionId` |
| `transactions.get` result | `id`, `status`, `amount`, `type`, `timeCreated`, `merchantTxRef`, `gatewayMessage` |
| `accounts.getBalance` result | `amount`, `currency`, `timeCreated` |
| `bills.buyAirtime` / `buyData` `network` | `"MTN"`, `"AIRTEL"`, `"GLO"`, `"9MOBILE"` |
| Every webhook | `event_type`, `requestId`, `data.merchant.{userId, walletId, walletBalance}`, `data.transaction.{transactionId, type, time, responseCode, transactionAmount, fee, sessionId}` |
| Checkout `payment_success` / `payment_failed` | also `data.order.{orderReference, orderId, customerEmail, customerId}`; the paid amount is `data.transaction.transactionAmount` |
| Saved card on `payment_success` | `data.tokenizedCardData.{tokenKey, cardType, cardPan, tokenExpiryMonth, tokenExpiryYear}`; `tokenKey` may be absent or `"N/A"` if not ready yet |
| Virtual account / transfer in | `data.transaction.{aliasAccountNumber, aliasAccountReference, aliasAccountName}`, `data.customer.{senderName, bankName, accountNumber}` |
| Payout events (`payout_*`) | `data.transaction.merchantTxRef` (your reference), `transactionAmount` |

Payloads can carry extra fields; read defensively and confirm the shape once against a sandbox webhook.

