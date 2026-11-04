# Changelog

## [0.1.0] - 2026-11-04

First release.

### Added

- `nomba-integration`: SDK choice and setup, credentials, sandbox vs production, errors, transaction statuses, idempotency references and requery. Per-language SDK references (Node.js, Python, PHP) and a raw-HTTP fallback.
- `nomba-checkout`: checkout orders, confirming payment from the server, saved cards and recurring charges with OTP, refunds.
- `nomba-payouts`: bank and wallet transfers with account-name lookup, bulk payouts, bill payments, reconciling unknown outcomes.
- `nomba-webhooks`: raw-body signature verification with the SDKs, deduplication, the meaning of each event, recipes for Express, Next.js, NestJS, Fastify, Flask, FastAPI, Django, Laravel and plain PHP.
- 8 eval cases (2 per skill). With the skills, Claude Sonnet passed 100% of 47 checks; without them, 74%.
- Claude Code plugin marketplace: `/plugin marketplace add NombaOSS/skills`, then `/plugin install nomba@nomba`.
- CI that validates the skills and checks every SDK method they mention against the published npm, PyPI and Packagist packages.
