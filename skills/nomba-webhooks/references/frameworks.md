# Raw body and verification by framework

The signature must be checked against the exact bytes Nomba sent. Each section shows how to get them, verify, deduplicate and acknowledge. `recordOnce` / `record_once` stands for "insert `requestId` with a unique constraint and return false on conflict"; `enqueue` stands for your job queue.

Contents: [Express](#express) · [Next.js](#nextjs-app-router) · [NestJS](#nestjs) · [Fastify](#fastify) · [Flask](#flask) · [FastAPI](#fastapi) · [Django](#django) · [Laravel](#laravel) · [Plain PHP](#plain-php)

## Express

```ts
app.post("/webhooks/nomba", express.raw({ type: "*/*" }), handler);
// Register this route before app.use(express.json()), or the JSON parser consumes the body first.
// In the handler: verifyWebhook(req.body /* Buffer */, req.headers, key, { toleranceSeconds: 300 })
```

## Next.js (App Router)

```ts
// app/api/webhooks/nomba/route.ts
import { verifyWebhook } from "@nombaoss/nomba-node";

export const runtime = "nodejs"; // verification uses node:crypto

export async function POST(request: Request) {
  const raw = await request.text();
  let event;
  try {
    event = verifyWebhook(raw, request.headers, process.env.NOMBA_WEBHOOK_SIGNING_KEY!, {
      toleranceSeconds: 300,
    });
  } catch {
    return new Response(null, { status: 401 });
  }
  if (await recordOnce(event.requestId)) await enqueue(event);
  return new Response(null, { status: 200 });
}
```

## NestJS

Enable raw bodies when creating the app, then read `req.rawBody`:

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });

@Post("webhooks/nomba")
@HttpCode(200)
async nomba(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>) {
  let event;
  try {
    event = verifyWebhook(req.rawBody!, headers, this.config.get("NOMBA_WEBHOOK_SIGNING_KEY")!, {
      toleranceSeconds: 300,
    });
  } catch {
    throw new UnauthorizedException();
  }
  if (await this.events.recordOnce(event.requestId)) await this.queue.add("nomba", event);
}
```

## Fastify

Register a string parser for JSON inside the webhook's plugin scope so other routes keep normal parsing:

```ts
app.register(async (scope) => {
  scope.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) =>
    done(null, body)
  );
  scope.post("/webhooks/nomba", async (req, reply) => {
    try {
      const event = verifyWebhook(req.body as string, req.headers, key, { toleranceSeconds: 300 });
      if (await recordOnce(event.requestId)) await enqueue(event);
      return reply.code(200).send();
    } catch {
      return reply.code(401).send();
    }
  });
});
```

## Flask

```python
from flask import abort, request
from nomba import WebhookVerificationError
from nomba.webhooks import verify_signature

@app.post("/webhooks/nomba")
def nomba_webhook():
    try:
        event = verify_signature(request.get_data(), request.headers, SIGNING_KEY, tolerance_seconds=300)
    except WebhookVerificationError:
        abort(401)
    if record_once(event["requestId"]):
        enqueue(event)
    return "", 200
```

## FastAPI

```python
from fastapi import HTTPException, Request
from nomba import WebhookVerificationError
from nomba.webhooks import verify_signature

@app.post("/webhooks/nomba")
async def nomba_webhook(request: Request):
    raw = await request.body()
    try:
        event = verify_signature(raw, request.headers, SIGNING_KEY, tolerance_seconds=300)
    except WebhookVerificationError:
        raise HTTPException(status_code=401)
    if await record_once(event["requestId"]):
        await enqueue(event)
    return {}
```

Don't declare a Pydantic body parameter on this route; read `request.body()` directly.

## Django

```python
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from nomba import WebhookVerificationError
from nomba.webhooks import verify_signature

@csrf_exempt
@require_POST
def nomba_webhook(request):
    try:
        event = verify_signature(request.body, request.headers, settings.NOMBA_WEBHOOK_SIGNING_KEY, tolerance_seconds=300)
    except WebhookVerificationError:
        return HttpResponse(status=401)
    if record_once(event["requestId"]):
        enqueue(event)
    return HttpResponse(status=200)
```

## Laravel

```php
use Illuminate\Http\Request;
use Nomba\Exception\WebhookVerificationException;
use Nomba\Webhook;

Route::post('/webhooks/nomba', function (Request $request) {
    try {
        $event = Webhook::verify(
            $request->getContent(),
            $request->headers->all(),
            config('services.nomba.webhook_signing_key'),
            300,
        );
    } catch (WebhookVerificationException) {
        return response('', 401);
    }
    if (WebhookEvent::recordOnce($event['requestId'])) {
        ProcessNombaWebhook::dispatch($event);
    }
    return response('', 200);
});
```

Exclude the route from CSRF: in Laravel 11+, `->withMiddleware(fn ($m) => $m->validateCsrfTokens(except: ['webhooks/nomba']))` in `bootstrap/app.php`; in older versions, add it to `$except` in `VerifyCsrfToken`. Or define it in `routes/api.php`.

## Plain PHP

```php
$raw = file_get_contents('php://input');
try {
    $event = Nomba\Webhook::verify($raw, getallheaders(), (string) getenv('NOMBA_WEBHOOK_SIGNING_KEY'), 300);
} catch (Nomba\Exception\WebhookVerificationException) {
    http_response_code(401);
    exit;
}
if (record_once($event['requestId'])) {
    enqueue($event);
}
http_response_code(200);
```

`Webhook::verify` also accepts PSR-7 `getHeaders()`, Symfony `$request->headers->all()` and `$_SERVER`.
