# Python SDK reference (nomba)

Written against nomba 0.1.2. Install with `pip install nomba`. Source and full README: https://github.com/NombaOSS/nomba-python

Contents: [Quickstart](#quickstart) · [Configuration](#configuration) · [Resources](#resources) · [Errors](#errors) · [Retries and idempotency](#retries-and-idempotency) · [Transaction statuses](#transaction-statuses) · [Pagination](#pagination) · [Webhooks](#webhooks) · [Token store](#token-store) · [Sandbox and production](#sandbox-and-production)

Read the section you need; the money-safety rules in SKILL.md apply on top of this.

## Quickstart

```python
from nomba import Nomba

nomba = Nomba(
    client_id="...",  # or NOMBA_CLIENT_ID
    client_secret="...",  # or NOMBA_CLIENT_SECRET
    account_id="...",  # or NOMBA_ACCOUNT_ID (your parent account ID)
)  # sandbox by default

balance = nomba.accounts.get_balance()
print(balance["amount"], balance["currency"])
```

Async is the same surface with `await`:

```python
from nomba import AsyncNomba

async with AsyncNomba() as nomba:
    balance = await nomba.accounts.get_balance()
```

Both clients work as context managers; otherwise call `close()` (sync) or `await aclose()` (async) when you're done. Every method returns the `data` field of Nomba's response envelope.

## Configuration

| Option | Default | Notes |
|---|---|---|
| `client_id` | env `NOMBA_CLIENT_ID` | Required. |
| `client_secret` | env `NOMBA_CLIENT_SECRET` | Required. Never logged or shown in `repr()`. |
| `account_id` | env `NOMBA_ACCOUNT_ID` | Required. Your parent account ID, sent as the `accountId` header on every request. |
| `environment` | env `NOMBA_ENVIRONMENT`, else `"sandbox"` | `"sandbox"` (`https://sandbox.nomba.com`) or `"production"` (`https://api.nomba.com`). Anything else is rejected. |
| `base_url` | from `environment` | Override for proxies or tests. Must be `https://` unless the host is `localhost` or `127.0.0.1`. |
| `timeout` | `30` | Seconds. The total time one attempt may take, from connecting to reading the last byte of the body. |
| `max_retries` | `2` | Automatic retries for GET requests and token calls. See [Retries](#retries-and-idempotency). |
| `token_store` | in-memory | Where the access token is cached. See [Token store](#token-store). |
| `http_client` | a new `httpx.Client` / `httpx.AsyncClient` | Bring your own for proxies, custom TLS or connection limits. The SDK won't close a client you pass in. |

A missing credential raises `ConfigurationError` at construction, naming the option and environment variable. No network call happens until your first API call.

## Resources

Body parameters are dicts with Nomba's field names (`accountNumber`, `merchantTxRef`, ...), typed as `TypedDict`s in `nomba.types`. Query and path options are snake_case keyword arguments. Methods that can act for a sub-account take `sub_account_id=`.

### Accounts

```python
parent = nomba.accounts.get_parent()
balance = nomba.accounts.get_balance(sub_account_id="...")  # omit for the parent account
sub = nomba.accounts.get_sub_account(account_ref="merchant-42")  # or account_id=
page = nomba.accounts.list_terminals(limit=50)
for terminal in nomba.accounts.list_all_terminals():
    print(terminal["terminalId"])
```

### Virtual accounts

```python
va = nomba.virtual_accounts.create({"accountRef": "invoice-1042", "accountName": "Ada Lovelace"})
nomba.virtual_accounts.get("invoice-1042")
nomba.virtual_accounts.update("invoice-1042", {"expectedAmount": "5000.00"})
nomba.virtual_accounts.expire("invoice-1042")
for account in nomba.virtual_accounts.list_all({"expired": False}):
    print(account["bankAccountNumber"])
```

### Transfers

```python
banks = nomba.transfers.list_banks()
who = nomba.transfers.lookup_account(account_number="0123456789", bank_code="058")
transfer = nomba.transfers.to_bank(
    {
        "amount": 3500,
        "accountNumber": "0123456789",
        "accountName": who["accountName"],
        "bankCode": "058",
        "merchantTxRef": "payout-1042",  # optional, generated if omitted
        "narration": "Invoice 1042",
    }
)
nomba.transfers.to_wallet({"amount": 500, "receiverAccountId": "..."})
```

### Transactions

```python
nomba.transactions.get(merchant_tx_ref="payout-1042")  # or transaction_ref=, order_reference=, order_id=
nomba.transactions.requery(session_id)  # by NIP session ID
page = nomba.transactions.list(limit=50, date_from="2026-01-01T00:00:00Z")
for txn in nomba.transactions.filter_all({"status": "SUCCESS", "source": "api"}):
    ...
for entry in nomba.transactions.list_all_bank_transactions():
    ...
```

### Checkout

```python
order = nomba.checkout.create_order(
    {
        "order": {
            "callbackUrl": "https://merchant.example.com/done",
            "customerEmail": "ada@example.com",
            "amount": "5000.00",
            "currency": "NGN",
        },
        "tokenizeCard": True,
    }
)
redirect_to(order["checkoutLink"])

nomba.checkout.get_transaction(id_type="ORDER_REFERENCE", id=order["orderReference"])
nomba.checkout.refund({"transactionId": "..."})

charge = nomba.checkout.charge_saved_card(
    {
        "tokenKey": "...",
        "order": {"customerEmail": "ada@example.com", "amount": "5000.00", "currency": "NGN"},
    }
)
if charge.get("otpRequired"):
    nomba.checkout.submit_card_otp(
        {"otp": "...", "orderReference": charge["orderReference"], "transactionId": charge["transactionId"]}
    )
```

Also: `get_order`, `cancel_order`, `list_saved_cards`, `update_saved_card_email`, `delete_saved_card`, `get_transfer_account`, `submit_card_details`, `resend_otp`, `confirm_transaction_receipt`, `cancel_transaction`, `request_save_card_otp`, `request_saved_cards_otp`, `submit_user_otp`, `get_saved_cards`.

### Terminals

```python
nomba.terminals.assign({"serialNumber": "91230309116826", "terminalLabel": "Till 1"})
nomba.terminals.unassign({"serialNumber": "91230309116826"}, sub_account_id="...")
nomba.terminals.send_payment_request("2KUD4AKB", {"merchantTxRef": "pos-1", "amount": 1000, "currency": "NGN"})
```

### Direct debits

```python
mandate = nomba.direct_debits.create_mandate({...})
nomba.direct_debits.get_mandate_status(mandate["mandateId"])
nomba.direct_debits.debit_mandate({"mandateId": mandate["mandateId"], "amount": "110.00"})
nomba.direct_debits.list_mandates(page=1, page_size=20, from_="2026-01-01", to="2026-02-01")
nomba.direct_debits.update_mandate_status({"mandateId": "...", "status": "SUSPEND"})
```

`from` is a Python keyword, so the date filter is `from_=`; it is sent as `from`.

### Bills

```python
nomba.bills.buy_airtime({"amount": 200, "phoneNumber": "08055441122", "network": "MTN"})
plans = nomba.bills.list_data_plans("mtn")
nomba.bills.buy_data({"productId": plans[0]["productId"], "phoneNumber": "08055441122", "network": "MTN"})
customer = nomba.bills.lookup_electricity_customer(disco="jed", customer_id="12345678902")
nomba.bills.buy_electricity(
    {"disco": "jed", "customerId": "12345678902", "amount": 1000, "meterType": "prepaid", "payerName": customer["name"]}
)
nomba.bills.pay_cable_tv({"cableTvType": "dstv", "customerId": "...", "amount": 19000})
nomba.bills.fund_betting({"bettingProvider": "bet9ja", "customerId": "...", "amount": 1000})
```

Also: `list_electricity_providers`, `list_cable_tv_plans`, `lookup_cable_tv_customer`, `list_betting_providers`, `lookup_betting_customer`. Purchases use the v2 endpoints.

### Global payout and collection

```python
accounts = nomba.global_payout.list_accounts()  # sandbox uses Nomba's sandbox account paths
rates = nomba.global_payout.get_exchange_rates(from_="USD", to="CDF")
quote = nomba.global_payout.convert_money(
    {"amount": 15, "currency": "USD", "destinationCurrency": "EUR", "transactionType": "EXCHANGE"}
)
nomba.global_payout.authorize_transfer({...})
nomba.global_collection.initiate_inflow(
    {"phoneNumber": "...", "callbackUrl": "...", "amount": 10, "currency": "CDF", "topupVendor": "AIRTEL"}
)
```

Also: `get_account`, `list_bank_providers`, `list_payment_methods`, `get_transaction`, `authorize_exchange`, `global_collection.list_drc_providers`, `global_collection.get_transaction`.

### Auth

Tokens are handled for you. `nomba.auth.revoke()` revokes the cached access token and clears the token store.

## Errors

All errors inherit from `nomba.NombaError`.

| Exception | When |
|---|---|
| `ConfigurationError` | Missing or invalid client options. |
| `AuthenticationError` | 401 after the SDK refreshed the token and retried once, or the token could not be issued. |
| `PermissionDeniedError` | 403 |
| `NotFoundError` | 404 |
| `ValidationError` | 400 or 422, or a client-side check failed before sending (bad path parameter, missing argument, `limit` over 50). Client-side ones have `http_status=None`. |
| `RateLimitError` | 429. `retry_after` (seconds) and `rate_limit_limit`, `rate_limit_remaining`, `rate_limit_window` from the `X-Rate-Limit-*` headers. |
| `ServerError` | 5xx |
| `ApiError` | HTTP 2xx but a non-success `code`. Also the parent of the five classes above. |
| `APIConnectionError` | Network failure. |
| `APITimeoutError` | Timeout (a subclass of `APIConnectionError`). |
| `WebhookVerificationError` | See [Webhooks](#webhooks). |

`ApiError` carries `http_status`, `code`, `description` (Nomba's message), `body` (parsed response), `method` and `path`. Every error from a money-moving call also carries `reference` (see [Retries and idempotency](#retries-and-idempotency)):

```python
from nomba import ApiError, RateLimitError

try:
    nomba.transfers.to_bank({...})
except RateLimitError as err:
    wait(err.retry_after)
except ApiError as err:
    print(err)  # Nomba API error 400 (code "400"): Invalid account number [POST /v2/transfers/bank]
```

Messages never include your client secret, tokens, headers or query strings.

## Retries and idempotency

GET requests and token calls are retried automatically on connection errors, timeouts, 429 and 5xx, up to `max_retries` times, with exponential backoff and jitter (about 0.5 s, 1 s, 2 s, up to 8 s). On a 429 the SDK waits for `Retry-After` (capped at 60 s).

POST, PUT and DELETE are **never** retried automatically. A timeout or a 502 doesn't tell you whether Nomba processed the request, and retrying a transfer could send the money twice. The one exception is a 401: Nomba rejected the token, so the request wasn't processed, and the SDK gets a new token and retries once.

For money-moving calls (`transfers.to_bank`, `transfers.to_wallet`, every `bills` purchase), the SDK sends a `merchantTxRef`. Pass your own, store it before you call, and reuse it if you retry: Nomba uses it to reject duplicates. If you leave it out, the SDK generates a random UUID v4 and returns it in the result as `result["merchantTxRef"]`. `checkout.charge_saved_card` has no `merchantTxRef`; its idempotency key is `order.orderReference`, which the SDK generates the same way and returns as `result["orderReference"]`.

Every error raised by a money-moving call has `err.reference`, a `Reference` with `field` (`"merchantTxRef"`, or `"orderReference"` for saved-card charges) and `value` (yours or the generated one), so you never lose it. Other calls leave it `None`.

On `APITimeoutError`, `APIConnectionError` or `ServerError` the outcome is unknown. Don't send a new request with a new reference. Requery with `err.reference.value` first, and if Nomba has no record of it, retry with the **same** reference:

```python
from nomba import APIConnectionError, NotFoundError, ServerError

try:
    result = nomba.transfers.to_bank(params)
except (APIConnectionError, ServerError) as err:  # APITimeoutError is an APIConnectionError
    ref = err.reference
    try:
        result = nomba.transactions.get(merchant_tx_ref=ref.value)
    except NotFoundError:
        result = nomba.transfers.to_bank({**params, ref.field: ref.value})
```

See [examples/transfer_with_requery.py](https://github.com/NombaOSS/nomba-python/blob/main/examples/transfer_with_requery.py).

## Transaction statuses

The SDK never raises because of `data.status`. Check it yourself; the values are in `nomba.TransactionStatus`.

| `data.status` | What happened | Refund your customer? |
|---|---|---|
| `SUCCESS` | Delivered to the destination. | No |
| `REFUND` | Funds returned to your Nomba wallet. | Yes |
| `CANCELLED` | The transaction won't proceed. | Contact Nomba support |
| `PAYMENT_FAILED` | The debit failed; Nomba may retry. | Wait for the webhook |
| `REVERSED_BY_VENDOR` | Nomba may retry through another vendor. | Wait for the webhook |
| `PENDING_BILLING` | Still processing. | Wait for the webhook |
| `PROCESSING` | Still processing (v1 endpoints). | Wait for the webhook |

If you get a status that isn't listed, requery or wait for the webhook. Only refund on a `payout_refund` webhook or a requery that returns `REFUND`. Source: [Response codes](https://developer.nomba.com/docs/api-basics/response-codes).

## Pagination

List endpoints return one page: `{"results": [...], "cursor": "..."}`. Pass the cursor back to get the next page; an empty cursor means the last page. `limit` is at most 50.

The `*_all` helpers follow the cursors for you and yield items:

```python
for txn in nomba.transactions.list_all(limit=50, date_from="2026-01-01T00:00:00Z"):
    ...

async for txn in async_nomba.transactions.list_all():
    ...
```

Helpers: `transactions.list_all`, `transactions.filter_all`, `transactions.list_all_bank_transactions`, `accounts.list_all_terminals`, `virtual_accounts.list_all`. `direct_debits.list_mandates` and `checkout.list_saved_cards` use page numbers instead.

## Webhooks

Verify every webhook before you trust it. You don't need API credentials for this:

```python
from flask import Flask, abort, request
from nomba.webhooks import verify_signature
from nomba import WebhookEventType, WebhookVerificationError

app = Flask(__name__)


@app.post("/webhooks/nomba")
def nomba_webhook():
    try:
        event = verify_signature(request.get_data(), request.headers, SIGNING_KEY)
    except WebhookVerificationError:
        abort(401)
    if event["event_type"] == WebhookEventType.PAYMENT_SUCCESS:
        ...
    return "", 200
```

**Pass the raw request body** (`request.get_data()` in Flask, `await request.body()` in FastAPI), as bytes or str. Don't parse it and re-encode it.

The signature is a base64 HMAC-SHA256 of fields from the body and the `nomba-timestamp` header, keyed with the signing key from your Nomba dashboard. The SDK reads `nomba-signature` (or `nomba-sig-value`) and `nomba-timestamp` case-insensitively, rejects any `nomba-signature-algorithm` other than `HmacSHA256`, and compares the signature exactly, in constant time. Base64 is case-sensitive, so a signature that differs only in letter case is rejected.

Because the signed fields are joined with `:` and the timestamp itself contains colons, the SDK always requires `nomba-timestamp` to be a strict RFC 3339 timestamp (for example `2025-09-29T10:51:44Z`) and rejects a webhook whose `data.transaction.responseCode` contains `:`. Otherwise part of the timestamp could be moved into the body without changing the signature.

**Replay protection.** Deduplicating on the signed `event["requestId"]` is the main defence: a replayed or retried delivery of an event you've already processed changes nothing. `tolerance_seconds` rejects webhooks whose timestamp is further than that from now, but leave it off (the default). Nomba documents `nomba-timestamp` as the time the payload was sent, without saying whether automatic retries get a fresh one. If they keep the original, a short tolerance would reject legitimate retries after an outage. Only enable it after confirming in the sandbox that redeliveries carry a new timestamp, and then keep it generous (for example an hour) with server clocks synced.

**Confirm money decisions with the API.** The signature doesn't cover the amount, `orderReference`, `merchantTxRef` or the card `tokenKey`. Before you fulfil, refund or store a card token, requery with `transactions.get` (`order_reference=` for checkout payments, `merchant_tx_ref=` for payouts) and act on its answer.

From a client you can also call `nomba.webhooks.verify(raw_body, headers, signing_key)`. Event types are in `nomba.WebhookEventType`: `payment_success`, `payment_failed`, `payment_reversal`, `payout_success`, `payout_failed`, `payout_refund`. See [examples/webhook_flask.py](https://github.com/NombaOSS/nomba-python/blob/main/examples/webhook_flask.py) and [examples/webhook_fastapi.py](https://github.com/NombaOSS/nomba-python/blob/main/examples/webhook_fastapi.py).

## Token store

The client gets an access token on the first call, refreshes it within 5 minutes of expiry, and shares one in-flight token request between concurrent calls. Tokens live in memory by default.

If you run several processes, Nomba recommends a single authenticating instance. Implement a store to share one token:

```python
from nomba import Nomba, Token


class RedisTokenStore:
    def get(self) -> Token | None: ...
    def set(self, token: Token | None) -> None: ...


nomba = Nomba(token_store=RedisTokenStore())
```

`AsyncNomba` accepts the same sync interface or an async one (`async def get` / `async def set`). `Token` is a frozen dataclass with `access_token`, `refresh_token` and `expires_at` (an aware `datetime`); store and restore those three fields.

## Sandbox and production

The client uses the sandbox unless you pass `environment="production"` or set `NOMBA_ENVIRONMENT=production`. Sandbox and production use different credentials. Global Payout account endpoints use Nomba's separate sandbox paths in the sandbox; the SDK picks the right one.
