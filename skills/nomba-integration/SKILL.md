---
name: nomba-integration
description: >-
  How to integrate the Nomba payments API (Nigeria) correctly in Node.js/TypeScript, Python or PHP using the official NombaOSS SDKs. Use this whenever code touches Nomba in any way, even if the user doesn't name the SDK: setting up a Nomba client, credentials or sandbox, calling api.nomba.com or sandbox.nomba.com, account balances, virtual accounts, transactions, requery, terminals, direct debits, bills, error handling or Nomba response codes. Also use it when reviewing or debugging existing Nomba integration code, or replacing hand-written fetch/requests/curl calls to Nomba. For accepting payments, payouts and webhooks there are dedicated skills (nomba-checkout, nomba-payouts, nomba-webhooks); this one covers the foundations they all share.
---

# Integrating Nomba

Nomba moves real money. Most integration bugs are not syntax errors; they are a transfer sent twice after a timeout, a customer refunded for a payment that later succeeded, or a forged webhook trusted. This skill sets up the foundations so those mistakes don't happen.

## 1. Use the official SDK

Prefer the SDK over raw HTTP. It handles OAuth tokens and refresh, the response envelope, safe retries, idempotency references and webhook verification, which are easy to get subtly wrong by hand.

| Language | Install | Import |
|---|---|---|
| Node.js / TypeScript (Node 18+) | `npm install @nombaoss/nomba-node` | `import Nomba from "@nombaoss/nomba-node"` |
| Python 3.10+ | `pip install nomba` | `from nomba import Nomba, AsyncNomba` |
| PHP 8.1+ | `composer require nombaoss/nomba-php` | `use Nomba\Nomba;` |

Read the reference for the project's language before writing code; it has the exact method names and call shapes:
- Node/TypeScript: [references/node.md](references/node.md)
- Python: [references/python.md](references/python.md)
- PHP: [references/php.md](references/php.md)

If the project already calls Nomba with raw HTTP, say so and offer to switch to the SDK. If raw HTTP is unavoidable (another language, a constrained runtime), follow [references/raw-http.md](references/raw-http.md), which lists everything the SDK would otherwise handle.

## 2. Configuration

Three credentials, from the Nomba dashboard (Developer section): client ID, client secret, and the **parent account ID** (sent as the `accountId` header on every request). Read them from the environment: `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID`. The SDKs read these automatically. Never hard-code them or put them in client-side code: the secret can move money.

The SDKs default to the **sandbox** (`https://sandbox.nomba.com`). Production (`https://api.nomba.com`) is opt-in with `environment: "production"` or `NOMBA_ENVIRONMENT=production`, and needs different credentials. Keep that default; wire production through configuration, not code changes. Production calls also need the server's IPs whitelisted by Nomba (send up to 3 static IPv4 addresses to docs@nomba.com).

Create one client per process and reuse it. It caches the access token (tokens last about 30 minutes and are refreshed automatically). If you run several instances, pass a shared `tokenStore` (for example backed by Redis) so they don't each authenticate; Nomba recommends a single authenticating instance.

## 3. Responses and errors

Every SDK method returns the `data` field of Nomba's `{ code, description, data }` envelope. A request counts as successful when the HTTP status is 2xx and `code` is `"00"`, `"200"` or `"201"`; otherwise the SDK raises:

| Error | When |
|---|---|
| `ValidationError` | 400/422, or bad input caught before sending |
| `AuthenticationError` | 401 after one automatic token renewal, or credentials rejected |
| `PermissionDeniedError` / `NotFoundError` | 403 / 404 |
| `RateLimitError` | 429 (has `retryAfter` / `retry_after`) |
| `ServerError` | 5xx |
| `ApiError` | 2xx with a non-success `code`, and the parent of the above |
| connection / timeout errors | the request may or may not have reached Nomba |

PHP uses the same names with an `Exception` suffix (`NotFoundException`); Python uses `APIConnectionError` / `APITimeoutError` for the network ones.

Catch specific errors where you can act on them. Don't swallow errors from money-moving calls, and don't map every failure to "payment failed": a timeout means **unknown**, not failed (see section 5).

## 4. Transaction status is separate from errors

A successful call can still describe a transaction that hasn't completed. Check `data.status` yourself; the SDKs never raise because of it, and export the values as `TransactionStatus`:

| `status` | Meaning | Refund the customer? |
|---|---|---|
| `SUCCESS` | Delivered | No |
| `REFUND` | Money returned to your Nomba wallet | Yes |
| `CANCELLED` | Won't proceed | Contact Nomba support |
| `PAYMENT_FAILED` | Debit failed, Nomba may retry | Wait for the webhook |
| `REVERSED_BY_VENDOR` | Nomba may retry another vendor | Wait for the webhook |
| `PENDING_BILLING` / `PROCESSING` | Still processing | Wait for the webhook |

For any status not in this table, requery or wait for the webhook. Only refund on a `payout_refund` webhook or a requery that returns `REFUND`. Treating `PAYMENT_FAILED` or a timeout as final is how merchants refund customers who were actually paid.

## 5. Unknown outcomes: requery, then retry with the same reference

The SDKs never retry POST/PUT/DELETE on their own, because a retried transfer can pay twice. Only GETs and token calls are retried automatically.

Money-moving calls (transfers, bill purchases, saved-card charges) carry an idempotency reference: `merchantTxRef` (or `order.orderReference` for saved-card charges). Generate it from your own data (`payout-${invoice.id}`), **store it before calling**, and reuse it on any retry so Nomba can reject the duplicate. If you omit it, the SDK generates a UUID, returns it on the result, and attaches it to any error as `err.reference` (`$e->getReference()` in PHP).

On a timeout, connection error or 5xx from a money-moving call:
1. Requery: `transactions.get({ merchantTxRef })` (Python `transactions.get(merchant_tx_ref=...)`, PHP `$nomba->transactions->get(['merchantTxRef' => ...])`).
2. If it exists, act on its `status`.
3. If it's `NotFoundError`, Nomba never received it: retry with the **same** reference.

Never generate a new reference for a retry.

## 6. Sub-accounts and pagination

Methods that can act on a sub-account take an optional `subAccountId` (`sub_account_id` in Python) instead of separate methods, for example `accounts.getBalance({ subAccountId })` or `transfers.toBank(params, { subAccountId })`.

List endpoints return `{ results, cursor }` pages with `limit` up to 50. Use the SDK's auto-pagers (`transactions.listAll`, `list_all` in Python, `listAll` returning a Generator in PHP) instead of hand-rolling cursor loops.

## 7. Before you finish

Check the integration against this list and fix anything that fails:
- Credentials come from the environment, the sandbox is the default, and production is configuration only.
- One shared client; no per-request client construction.
- Every money-moving call has a stored, deterministic reference that is reused on retry.
- Timeouts and 5xx on money-moving calls lead to a requery, never to "failed" or an immediate new-reference retry.
- `data.status` is checked; refunds happen only on `REFUND` / `payout_refund`.
- Webhooks are verified on the raw body (use the nomba-webhooks skill).
- Tests use the sandbox or a mocked HTTP layer, never production credentials.

Docs: https://developer.nomba.com · OpenAPI spec: https://github.com/NombaOSS/openapi
