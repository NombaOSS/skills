# Calling Nomba without an SDK

Use this only when none of the official SDKs fit (another language, a constrained runtime). Everything below is what the SDKs already do for you; skipping any of it reintroduces a known bug.

Contents: [Base URLs](#base-urls) · [Authentication](#authentication) · [Requests](#requests) · [Responses](#responses) · [Retries](#retries) · [Idempotency](#idempotency) · [Pagination](#pagination) · [Webhook signatures](#webhook-signatures)

## Base URLs

- Sandbox: `https://sandbox.nomba.com` (default while developing)
- Production: `https://api.nomba.com` (needs production credentials and IP whitelisting)

Don't follow HTTP redirects on authenticated requests, so the bearer token only ever goes to these hosts.

## Authentication

Issue a token (client credentials):

```http
POST /v1/auth/token/issue
accountId: <parent account ID>
Content-Type: application/json

{ "grant_type": "client_credentials", "client_id": "...", "client_secret": "..." }
```

The response `data` has `access_token`, `refresh_token` and `expiresAt` (RFC 3339). Tokens last about 30 minutes. Cache the token and refresh it 5 minutes before `expiresAt`:

```http
POST /v1/auth/token/refresh
accountId: <parent account ID>

{ "grant_type": "refresh_token", "refresh_token": "..." }
```

If refresh fails with a 4xx, issue a new token. Let only one request at a time obtain a token (a lock or a shared in-flight promise), and share the token between instances if you run several. On a 401 from an API call, drop the cached token, get a new one, and replay the request once; a 401 means Nomba didn't process it.

## Requests

Every authenticated request sends:

```http
Authorization: Bearer <access_token>
accountId: <parent account ID>
Content-Type: application/json
Accept: application/json
```

URL-encode every path parameter, and reject empty values, `.`, `..`, and values containing `/` or `\` before sending. Otherwise a caller-supplied ID can reach a different endpoint. Note that `DELETE /v1/checkout/tokenized-card-data` takes a JSON body.

## Responses

Every response is an envelope: `{ "code": "00", "description": "...", "data": { ... } }`. Success is HTTP 2xx **and** `code` in `"00"`, `"200"`, `"201"` (or no `code`). A 2xx with any other `code` is a failure. Read `data.status` separately for transaction state (see the status table in SKILL.md).

Rate limits come back as 429 with `X-Rate-Limit-Limit`, `X-Rate-Limit-Remaining` and `X-Rate-Limit-Window` headers.

## Retries

Retry only GET requests and token issue/refresh, on network errors, timeouts, 429 and 5xx, with exponential backoff and jitter (0.5 s, 1 s, 2 s … capped), honouring `Retry-After` on 429. **Never retry POST, PUT or DELETE automatically**: a timed-out transfer may already have moved the money.

## Idempotency

Send a `merchantTxRef` on transfers (`/v2/transfers/bank`, `/v2/transfers/wallet`) and bill purchases (`/v2/bill/*`); saved-card charges (`/v1/checkout/tokenized-card-payment`) use `order.orderReference` instead. Generate it from your own data, store it before sending, and reuse it on retry. On an unknown outcome, requery `GET /v1/transactions/accounts/single?merchantTxRef=...` first; retry with the same reference only if Nomba returns 404.

Use the v2 bill and transfer endpoints; the v1 purchase endpoints are deprecated.

## Pagination

List endpoints take `limit` (1–50) and `cursor`, and return `data.results` plus `data.cursor`. An empty or missing cursor means the last page. Stop if a cursor repeats.

## Webhook signatures

Nomba signs webhooks with HMAC-SHA256 keyed with the signing key from the dashboard. Build the message from the parsed **raw** body and the `nomba-timestamp` header, joined with `:`:

```
event_type : requestId : data.merchant.userId : data.merchant.walletId :
data.transaction.transactionId : data.transaction.type : data.transaction.time :
data.transaction.responseCode : nomba-timestamp
```

Use `""` for a missing `responseCode` or the string `"null"`. The signature is `base64(HMAC_SHA256(key, message))`. Compare it with the `nomba-signature` header (fall back to `nomba-sig-value`) exactly and in constant time. Reject the webhook if:
- either header is missing, or `nomba-signature-algorithm` is present and isn't `HmacSHA256`;
- `nomba-timestamp` isn't a strict RFC 3339 timestamp, or `responseCode` contains `:`. Without these two checks, part of a genuine timestamp can be moved into `responseCode` to replay an old webhook with a valid signature;
- optionally, the timestamp is older than a tolerance you set. Leave this off unless you've confirmed that Nomba's redeliveries carry a fresh timestamp; otherwise legitimate retries after an outage are rejected. Deduplicate on `requestId` either way.

Test vector: the body in the NombaOSS SDKs' `webhook-fixture.json`, key `SampleSignatureKey123`, `nomba-timestamp: 2025-09-29T10:51:44Z` → `q30yFZDyykoymBf9+mt1wz5UAuLk57raPGPHlGzIv00=`.
