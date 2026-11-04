# skills

Agent skills for integrating the Nomba API with the official SDKs (nomba-node, nomba-python, nomba-php). Installable as a Claude Code plugin (`.claude-plugin/`).

## Rules
- Conventional commits; main squash-merges, so the PR title becomes the commit. Stage files by name.
- Never push to main. Branch and open a PR. Merge only when Sam says so.
- No AI attribution in commits, PRs or code comments.
- Public repo: don't name private Nomba repos.

## Editing skills
- Every SDK method, field name and class used in a skill must exist in the published SDKs. CI checks method names; check field names against the OpenAPI spec.
- Keep SKILL.md under 500 lines; put detail in `references/`.
- `shared/sdk-setup.md` is the source; copy it into `skills/{nomba-checkout,nomba-payouts,nomba-webhooks}/references/` after editing.
- When behaviour advice changes, rerun the affected eval cases and update the numbers in CHANGELOG.md.

## Releasing
Bump `version` in `.claude-plugin/plugin.json` and add a CHANGELOG entry in a `chore: release X.Y.Z` PR. On merge, `release.yml` waits for approval of the `release` environment, then creates the tag and GitHub Release. Never tag by hand.

## Before pushing
`node scripts/validate.mjs`
