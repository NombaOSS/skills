# Nomba skills

[![CI](https://github.com/NombaOSS/skills/actions/workflows/ci.yml/badge.svg)](https://github.com/NombaOSS/skills/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Agent skills that teach AI coding agents (Claude Code, and other agents that read `SKILL.md` skills) to integrate the [Nomba](https://developer.nomba.com) payments API correctly, using the official SDKs for [Node.js](https://github.com/NombaOSS/nomba-node), [Python](https://github.com/NombaOSS/nomba-python) and [PHP](https://github.com/NombaOSS/nomba-php).

Most payment bugs aren't syntax errors. They're a transfer sent twice after a timeout, a customer refunded for a payout that later succeeded, an order fulfilled from a spoofed callback URL, or a forged webhook trusted. These skills put those rules in front of the agent before it writes code.

| Skill | Use it for |
|---|---|
| [`nomba-integration`](skills/nomba-integration/SKILL.md) | Foundations: SDK choice, credentials, sandbox vs production, errors, transaction statuses, idempotency and requery |
| [`nomba-checkout`](skills/nomba-checkout/SKILL.md) | Accepting payments: checkout orders, confirming payment safely, saved cards and recurring charges, refunds |
| [`nomba-payouts`](skills/nomba-payouts/SKILL.md) | Sending money: bank and wallet transfers, bulk payouts, bills (airtime, data, electricity, cable, betting) |
| [`nomba-webhooks`](skills/nomba-webhooks/SKILL.md) | Receiving events: raw-body signature verification, deduplication, what each event means, per-framework recipes |

The agent loads a skill only when the task needs it, based on its description, so they stay out of the way otherwise.

## Install

### Claude Code

```
/plugin marketplace add NombaOSS/skills
/plugin install nomba@nombaoss
```

### Other agents

Copy the folders under [`skills/`](skills) into your agent's skills directory (for example `.claude/skills/` in a project, or the location your agent documents). Each folder is self-contained.

## How well they work

Each skill has test cases in its `evals/` folder: realistic requests ("add Nomba checkout to my Express shop", "pay out seller withdrawals in Django", "write the payout webhook in plain PHP"). Each case was run by an agent with the skill and without it, then graded against objective checks such as "never re-sends a transfer with a new reference", "refunds only on `payout_refund`", "verifies the webhook on the raw body" and "stores card tokens only from verified webhooks".

| | With skills | Without |
|---|---|---|
| Checks passed (8 cases, 47 checks, Claude Sonnet) | **100%** | 74% |
| Time per task | 56 s | 48 s |

Without the skills, agents hand-wrote HTTP clients with guessed field names, refunded customers on `payout_failed` (which can pay twice), shipped amount checks that let unverified payments through, and skipped OTP handling and rate limits. To rerun the cases with Claude Code, from a checkout of this repo:

```bash
cd skills/nomba-checkout && claude plugin eval . --allow-tools Write,Edit,Bash --scaffold
```

These are real, billed model runs.

## Contributing

The skills sit on top of the SDKs and the [OpenAPI spec](https://github.com/NombaOSS/openapi). When an SDK changes, update the matching skill text, then run:

```bash
node scripts/validate.mjs
node scripts/sync-sdk-references.mjs   # after an SDK release: refresh the per-language references
```

CI also installs the published SDKs from npm, PyPI and Packagist and checks that every SDK method the skills mention still exists.

`shared/sdk-setup.md` is copied into each workflow skill's `references/`, so each skill works on its own. Edit the shared file and run `node scripts/validate.mjs --fix` to write the copies.

## License

[MIT](LICENSE)
