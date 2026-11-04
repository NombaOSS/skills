# PHP SDK reference (nombaoss/nomba-php)

Written against nombaoss/nomba-php 0.1.0. Install with `composer require nombaoss/nomba-php`. Source and full README: https://github.com/NombaOSS/nomba-php

Contents: [Quickstart (sandbox)](#quickstart-sandbox) · [Configuration](#configuration) · [Responses](#responses) · [Resources](#resources) · [Errors](#errors) · [Retries and idempotency](#retries-and-idempotency) · [Transaction statuses](#transaction-statuses) · [Pagination](#pagination) · [Webhooks](#webhooks) · [Token store](#token-store) · [Sandbox and production](#sandbox-and-production)

Read the section you need; the money-safety rules in SKILL.md apply on top of this, and the nomba-webhooks skill's guidance on timestamp tolerance takes precedence over the examples here.

## Quickstart (sandbox)

```php
<?php
require 'vendor/autoload.php';

$nomba = new Nomba\Nomba([
    'clientId' => getenv('NOMBA_CLIENT_ID'),
    'clientSecret' => getenv('NOMBA_CLIENT_SECRET'),
    'accountId' => getenv('NOMBA_ACCOUNT_ID'),
]);

$balance = $nomba->accounts->getBalance();
echo $balance['amount'], ' ', $balance['currency'], PHP_EOL;
```

The client defaults to the sandbox. No request is made until the first API call; the access token is obtained then.

## Configuration

| Option | Default | Notes |
|---|---|---|
| `clientId` | env `NOMBA_CLIENT_ID` | Required. |
| `clientSecret` | env `NOMBA_CLIENT_SECRET` | Required. |
| `accountId` | env `NOMBA_ACCOUNT_ID` | Required. Your parent account ID, sent as the `accountId` header on every request. |
| `environment` | env `NOMBA_ENVIRONMENT`, else `sandbox` | `sandbox` (`https://sandbox.nomba.com`) or `production` (`https://api.nomba.com`). Anything else is rejected. |
| `baseUrl` | from `environment` | Override for tests or proxies. Must be `https://`, except `http://localhost` and `http://127.0.0.1`. |
| `timeout` | `30` | Seconds per request. |
| `maxRetries` | `2` | Retries for GET requests and token calls only. See [Retries](#retries-and-idempotency). |
| `tokenStore` | in-memory | A `Nomba\Auth\TokenStore`. See [Token store](#token-store). |
| `httpClient` | new `GuzzleHttp\Client` | Any `GuzzleHttp\ClientInterface`, for proxies, custom TLS or middleware. |
| `sleeper` | `usleep` | `callable(float $seconds): void` used between retries. Mainly for tests. |

A missing credential throws `Nomba\Exception\ConfigurationException` at construction, naming the option and the environment variable. Unknown option names are rejected too, so a typo does not silently fall back to a default.

`var_dump()` and `print_r()` of the client, its configuration and tokens show `[redacted]` in place of secrets.

## Responses

Nomba wraps every response in `{ code, description, data }`. The SDK checks the HTTP status and `code` (`00`, `200` and `201` are success) and returns `data` only, as a PHP array. Every method has PHPStan/Psalm array-shape types (see `src/Types.php`); shapes are open, so new fields from Nomba come through.

The SDK never throws because of `data.status`. A transfer that comes back `PENDING_BILLING` is a successful call; check the status yourself (see [Transaction statuses](#transaction-statuses)).

## Resources

Methods that work on the parent account or a sub-account take an optional `subAccountId`, which switches to the sub-account path.

### Accounts

```php
$parent = $nomba->accounts->getParent();
$balance = $nomba->accounts->getBalance(['subAccountId' => $subAccountId]); // omit for the parent
$sub = $nomba->accounts->getSubAccount(['accountRef' => 'shop-12']);         // or ['accountId' => ...]
$page = $nomba->accounts->listTerminals(['limit' => 50]);
foreach ($nomba->accounts->listAllTerminals() as $terminal) { /* every page */ }
```

### Virtual accounts

```php
$account = $nomba->virtualAccounts->create([
    'accountRef' => 'customer-881',
    'accountName' => 'Ada Obi',
    'bvn' => '22222222222',
]);
$account = $nomba->virtualAccounts->get('customer-881');
$nomba->virtualAccounts->update('customer-881', ['accountName' => 'Ada Obi Ltd']);
$nomba->virtualAccounts->expire('customer-881');
$page = $nomba->virtualAccounts->list(['expired' => false], ['limit' => 50]);
foreach ($nomba->virtualAccounts->listAll(['expired' => false]) as $account) { /* ... */ }
```

### Checkout

```php
$order = $nomba->checkout->createOrder([
    'order' => [
        'orderReference' => 'order-1042',
        'callbackUrl' => 'https://example.com/callback',
        'customerEmail' => 'customer@example.com',
        'amount' => 15000.00,
        'currency' => 'NGN',
    ],
    'tokenizeCard' => true,
]);
header('Location: ' . $order['checkoutLink']);

$details = $nomba->checkout->getOrder('order-1042');
$tx = $nomba->checkout->getTransaction(['idType' => 'ORDER_REFERENCE', 'id' => 'order-1042']);
$nomba->checkout->refund(['transactionId' => $transactionId, 'amount' => 5000]);

// Saved (tokenized) cards
$charge = $nomba->checkout->chargeSavedCard(['tokenKey' => $tokenKey, 'order' => [/* as above */]]);
if ($charge['otpRequired'] ?? false) {
    $nomba->checkout->submitCardOtp(['otp' => $otp, 'orderReference' => $charge['orderReference'], 'transactionId' => $charge['transactionId']]);
}
$cards = $nomba->checkout->listSavedCards(['customerEmail' => 'customer@example.com']);
$nomba->checkout->updateSavedCardEmail(['tokenKey' => $tokenKey, 'currentEmailAddress' => 'a@example.com', 'newEmailAddress' => 'b@example.com']);
$nomba->checkout->deleteSavedCard(['tokenKey' => $tokenKey]);
```

Also available for building your own checkout page: `cancelOrder`, `getTransferAccount`, `submitCardDetails`, `submitCardOtp`, `resendOtp`, `confirmTransactionReceipt`, `cancelTransaction`, `requestSaveCardOtp`, `requestSavedCardsOtp`, `submitUserOtp`, `getSavedCards`.

### Transfers

```php
$banks = $nomba->transfers->listBanks();
$recipient = $nomba->transfers->lookupAccount(['accountNumber' => '0123456789', 'bankCode' => '058']);

$transfer = $nomba->transfers->toBank([
    'amount' => 2500.00,
    'accountNumber' => '0123456789',
    'accountName' => $recipient['accountName'],
    'bankCode' => '058',
    'merchantTxRef' => 'payout-1042',   // your reference; see Idempotency
    'narration' => 'Order 1042',
]);

$nomba->transfers->toWallet(['amount' => 1000, 'receiverAccountId' => $otherAccountId]);
```

### Transactions

```php
$page = $nomba->transactions->list(['dateFrom' => '2026-01-01', 'dateTo' => '2026-01-31', 'limit' => 50]);
$page = $nomba->transactions->filter(['status' => 'SUCCESS', 'type' => 'transfer'], ['limit' => 50]);
$tx = $nomba->transactions->get(['merchantTxRef' => 'payout-1042']); // exactly one reference
$tx = $nomba->transactions->requery($sessionId);
$bank = $nomba->transactions->listBankTransactions(['limit' => 50]);
```

### Terminals

```php
$nomba->terminals->assign(['serialNumber' => 'SN123', 'terminalLabel' => 'Till 1'], ['subAccountId' => $subAccountId]);
$nomba->terminals->unassign(['serialNumber' => 'SN123']);
$nomba->terminals->sendPaymentRequest('2KUD0001', ['merchantTxRef' => 'pos-77', 'amount' => 5000, 'currency' => 'NGN']);
```

### Direct debits

```php
$mandate = $nomba->directDebits->createMandate([
    'customerAccountNumber' => '0123456789', 'bankCode' => '058',
    'customerName' => 'Ada Obi', 'customerAccountName' => 'Ada Obi', 'customerEmail' => 'ada@example.com',
    'amount' => 10000, 'frequency' => 'MONTHLY', 'merchantReference' => 'sub-ada-1',
    'startDate' => '2026-02-01T00:00:00Z', 'endDate' => '2027-01-31T00:00:00Z',
]);
$status = $nomba->directDebits->getMandateStatus($mandate['mandateId']);
$nomba->directDebits->debitMandate(['mandateId' => $mandate['mandateId'], 'amount' => '10000']);
$nomba->directDebits->listMandates(['page' => 1, 'pageSize' => 20]);
$nomba->directDebits->updateMandateStatus(['mandateId' => $mandate['mandateId'], 'status' => 'SUSPEND']);
```

### Bills

Purchases use Nomba's v2 endpoints.

```php
$nomba->bills->buyAirtime(['amount' => 500, 'phoneNumber' => '08030000000', 'network' => 'MTN']);
$plans = $nomba->bills->listDataPlans('mtn');
$nomba->bills->buyData(['productId' => $plans[0]['productId'], 'phoneNumber' => '08030000000', 'network' => 'MTN']);

$discos = $nomba->bills->listElectricityProviders();
$customer = $nomba->bills->lookupElectricityCustomer(['disco' => 'IKEDC', 'customerId' => '45700000000']);
$nomba->bills->buyElectricity(['disco' => 'IKEDC', 'customerId' => '45700000000', 'amount' => 5000, 'meterType' => 'PREPAID']);

$plans = $nomba->bills->listCableTvPlans('DSTV');
$name = $nomba->bills->lookupCableTvCustomer(['customerId' => '7012345678', 'cableTvType' => 'DSTV']);
$nomba->bills->payCableTv(['cableTvType' => 'DSTV', 'customerId' => '7012345678', 'amount' => 9000]);

$providers = $nomba->bills->listBettingProviders();
$name = $nomba->bills->lookupBettingCustomer(['providerId' => $providers[0]['id'], 'customerId' => 'user-1']);
$nomba->bills->fundBetting(['bettingProvider' => $providers[0]['id'], 'customerId' => 'user-1', 'amount' => 1000]);
```

### Global payout

In the sandbox, `listAccounts` and `getAccount` use the `/v1/sandbox/global-payout/accounts` paths; everything else is the same.

```php
$accounts = $nomba->globalPayout->listAccounts();
$rates = $nomba->globalPayout->getExchangeRates(['from' => 'NGN', 'to' => 'USD']);
$methods = $nomba->globalPayout->listPaymentMethods(['destinationCountryIsoCode' => 'GB']);
$quote = $nomba->globalPayout->convertMoney(['amount' => 100000, 'currency' => 'NGN', 'destinationCurrency' => 'GBP', 'transactionType' => 'SELL']);
$payout = $nomba->globalPayout->authorizeTransfer([
    'amount' => 100000, 'sourceCurrency' => 'NGN', 'destinationCurrency' => 'GBP',
    'receiverName' => 'Ada Obi', 'sourceCountryIsoCode' => 'NG', 'destinationCountryIsoCode' => 'GB',
    'paymentMethod' => 'FASTER_PAYMENTS', 'accountType' => 'INDIVIDUAL',
    'lockedExchangeRateId' => $quote['exchangeRateId'], 'idempotencyKey' => 'gp-1042',
]);
$nomba->globalPayout->getTransaction($payout['wtTransactionId']);
```

Also: `getAccount`, `listBankProviders`, `authorizeExchange`.

### Global collection

```php
$providers = $nomba->globalCollection->listDrcProviders();
$inflow = $nomba->globalCollection->initiateInflow([
    'phoneNumber' => '243810000000', 'callbackUrl' => 'https://example.com/cb',
    'amount' => 10, 'currency' => 'USD', 'topupVendor' => $providers[0]['code'], 'idempotencyKey' => 'in-1',
]);
$nomba->globalCollection->getTransaction($inflow['transactionReference']);
```

### Auth

Tokens are handled for you. To revoke the current token (for example when rotating credentials):

```php
$nomba->auth->revoke();
```

## Errors

Every exception extends `Nomba\Exception\NombaException`.

| Exception | When |
|---|---|
| `ApiException` | A 2xx response with a non-success `code`; also the parent of the classes below |
| `ValidationException` | HTTP 400 or 422, or a check the SDK made before sending (bad path parameter, missing argument, `limit` over 50) |
| `AuthenticationException` | HTTP 401 after one token renewal, or the access token could not be obtained |
| `PermissionDeniedException` | HTTP 403 |
| `NotFoundException` | HTTP 404 |
| `RateLimitException` | HTTP 429. Has `retryAfter` (seconds) and `rateLimitLimit`, `rateLimitRemaining`, `rateLimitWindow` |
| `ServerException` | HTTP 5xx |
| `ConnectionException` | No HTTP response (DNS, TLS, connection reset) |
| `TimeoutException` | The request timed out (extends `ConnectionException`) |
| `WebhookVerificationException` | A webhook failed verification |
| `ConfigurationException` | Invalid or missing options |

API exceptions carry `httpStatus`, `nombaCode` (Nomba's envelope `code`; PHP reserves `getCode()`, which returns the HTTP status), `description`, `body` (the parsed response), `method` and `path`. Messages look like:

```
Nomba API error 400 (code "400"): Invalid account number [POST /v2/transfers/bank]
```

Messages never include the query string, headers, tokens or your client secret.

```php
use Nomba\Exception\ApiException;
use Nomba\Exception\ConnectionException;
use Nomba\Exception\RateLimitException;

try {
    $nomba->transfers->toBank($params);
} catch (RateLimitException $e) {
    sleep((int) ceil($e->retryAfter ?? 1));
} catch (ApiException $e) {
    error_log("{$e->httpStatus} {$e->nombaCode}: {$e->description}");
} catch (ConnectionException $e) {
    // The transfer may or may not have happened: requery it (see below).
}
```

## Retries and idempotency

The SDK retries GET requests and token issue/refresh automatically, up to `maxRetries` times (default 2), on connection errors, timeouts, HTTP 429 and 5xx. It waits 0.5 s, 1 s, 2 s and so on (capped at 8 s, with jitter) and honours `Retry-After` on 429 (capped at 60 s).

**POST, PUT and DELETE are never retried automatically.** If a transfer request times out, Nomba may already have moved the money; sending it again could pay twice. The one exception is a 401: the SDK renews the token and replays the request once, because a 401 means Nomba rejected it before processing.

For money-moving calls (`transfers->toBank`, `transfers->toWallet`, every `bills` purchase), pass your own `merchantTxRef` and store it before you send. If the call fails without a clear answer (a timeout, a connection error or a 5xx), requery with that reference before retrying, and if you do retry, send the same reference so Nomba can deduplicate:

```php
use Nomba\Exception\ConnectionException;
use Nomba\Exception\NotFoundException;
use Nomba\Exception\ServerException;

try {
    $result = $nomba->transfers->toBank($params + ['merchantTxRef' => $ref]);
} catch (ConnectionException|ServerException $e) {   // ConnectionException includes TimeoutException
    $ref = $e->getReference()?->value ?? $ref;
    try {
        $result = $nomba->transactions->get(['merchantTxRef' => $ref]);
    } catch (NotFoundException) {
        // Nomba never received it: retry with the same $ref.
    }
}
```

If you leave `merchantTxRef` out, the SDK generates a UUID v4. On success it is in the returned array as `$result['merchantTxRef']`; on failure, every exception from these calls carries it: `$e->getReference()` returns a `Nomba\Exception\Reference` with `field` (`"merchantTxRef"`) and `value`. Either way you can requery without having picked a reference yourself.

`checkout->chargeSavedCard()` has no `merchantTxRef`; its reference is `order.orderReference`. It is generated the same way when you pass an `order` without one, returned as `$result['orderReference']`, and on failure available as `$e->getReference()` with `field` `"order.orderReference"`.

Global payout and collection calls take an `idempotencyKey`; pass one and reuse it when retrying.

## Transaction statuses

`data.status` on outflows (transfers, airtime, data, bills). Constants are in `Nomba\TransactionStatus`.

| Status | Meaning | Refund your customer? |
|---|---|---|
| `SUCCESS` | Delivered to the destination | No |
| `REFUND` | Funds returned to your Nomba wallet | Yes |
| `CANCELLED` | Will not proceed | Contact Nomba support |
| `PAYMENT_FAILED` | Debit failed; Nomba may retry | Wait for the webhook |
| `REVERSED_BY_VENDOR` | Nomba may retry through another vendor | Wait for the webhook |
| `PENDING_BILLING` | Still processing | Wait for the webhook |
| `PROCESSING` | Still processing (v1 endpoints) | Wait for the webhook |

For an undocumented status, requery or wait for a webhook. Only refund after a `payout_refund` webhook or a requery returning `REFUND`. Source: [Response codes](https://developer.nomba.com/docs/api-basics/response-codes).

## Pagination

Cursor-paginated methods return one page as `['results' => [...], 'cursor' => '...']`; an empty or missing cursor means the last page. `limit` is at most 50.

Each has a `Generator` that fetches pages as you iterate:

| Page | All items |
|---|---|
| `transactions->list()` | `transactions->listAll()` |
| `transactions->filter()` | `transactions->filterAll()` |
| `transactions->listBankTransactions()` | `transactions->listAllBankTransactions()` |
| `accounts->listTerminals()` | `accounts->listAllTerminals()` |
| `virtualAccounts->list()` | `virtualAccounts->listAll()` |

```php
foreach ($nomba->transactions->listAll(['dateFrom' => '2026-01-01', 'limit' => 50]) as $tx) {
    echo $tx['id'], ' ', $tx['status'], PHP_EOL;
}
```

`checkout->listSavedCards()` and `directDebits->listMandates()` are page-numbered: pass `page` yourself.

## Webhooks

Verify every webhook before acting on it. Use the raw request body exactly as received; decoding and re-encoding the JSON changes it.

```php
use Nomba\Exception\WebhookVerificationException;
use Nomba\Webhook;
use Nomba\WebhookEventType;

$rawBody = file_get_contents('php://input');

try {
    $event = Webhook::verify($rawBody, getallheaders(), (string) getenv('NOMBA_WEBHOOK_SIGNING_KEY'), 300);
} catch (WebhookVerificationException $e) {
    http_response_code(400);
    exit;
}

if ($event['event_type'] === WebhookEventType::PAYMENT_SUCCESS) {
    // fulfil the order; deduplicate on $event['requestId']
}
http_response_code(200);
```

- `Webhook::verify()` needs no API credentials. `$nomba->webhooks->verify()` does the same on a client.
- The signature is compared exactly, in constant time (base64 is case-sensitive), after trimming surrounding whitespace.
- Headers can be any case. A plain array, PSR-7 `getHeaders()`, Laravel/Symfony `$request->headers->all()` and `$_SERVER` (`HTTP_NOMBA_SIGNATURE`) all work.
- It reads `nomba-signature` (or the older `nomba-sig-value`) and `nomba-timestamp`, and rejects a `nomba-signature-algorithm` other than `HmacSHA256`.
- `nomba-timestamp` must be a strict RFC 3339 timestamp (for example `2025-09-29T10:51:44Z`), and `data.transaction.responseCode` must not contain `:`. The signed fields are joined with `:`, so without these checks part of a genuine timestamp could be moved into `responseCode` to replay an old webhook with a valid signature.
- The fourth argument is a tolerance in seconds: timestamps further than that from now are rejected, which stops replayed requests. It is off by default (`null`); 300 is a reasonable value if your clock is in sync.
- Event types: `payment_success`, `payment_failed`, `payment_reversal`, `payout_success`, `payout_failed`, `payout_refund` (constants on `WebhookEventType`).

In Laravel, pass `$request->getContent()` and `$request->headers->all()`. A complete plain-PHP handler is in `examples/webhook-handler.php`. Setup: [Webhooks](https://developer.nomba.com/docs/api-basics/webhook).

## Token store

Access tokens last about 30 minutes. The SDK keeps the token in memory, refreshes it within 5 minutes of expiry, and gets a new one if the refresh fails. PHP-FPM workers each have their own memory, so each would request its own token. Nomba recommends a single authenticating instance; to share one token, implement `Nomba\Auth\TokenStore`:

```php
use Nomba\Auth\Token;
use Nomba\Auth\TokenStore;

final class RedisTokenStore implements TokenStore
{
    public function __construct(private \Redis $redis) {}

    public function get(): ?Token
    {
        $json = $this->redis->get('nomba:token');
        return is_string($json) ? Token::fromArray(json_decode($json, true)) : null;
    }

    public function set(?Token $token): void
    {
        $token === null
            ? $this->redis->del('nomba:token')
            : $this->redis->set('nomba:token', json_encode($token->toArray()), ['EX' => 1800]);
    }
}

$nomba = new Nomba\Nomba(['tokenStore' => new RedisTokenStore($redis)]);
```

The stored value is a credential: keep it somewhere only your servers can read.

## Sandbox and production

The client uses the sandbox unless you pass `'environment' => 'production'` (or set `NOMBA_ENVIRONMENT=production`). Sandbox and production have separate credentials. Get them from your Nomba dashboard.
