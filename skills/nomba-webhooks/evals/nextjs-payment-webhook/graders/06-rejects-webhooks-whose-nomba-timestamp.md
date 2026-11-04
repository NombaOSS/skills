---
type: llm
focus: trace
weight: 1
---

Rejects webhooks whose nomba-timestamp is not a strict RFC 3339 timestamp or whose responseCode contains ':' (through the SDK verifier or an explicit check), so a captured webhook can't be replayed by shifting part of the timestamp into the body
