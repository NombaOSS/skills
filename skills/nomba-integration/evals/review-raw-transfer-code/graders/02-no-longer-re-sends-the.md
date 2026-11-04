---
type: llm
focus: trace
weight: 1
---

Never re-sends the transfer blindly after an error: any resend happens only after a requery shows Nomba has no record of it, and uses the same merchantTxRef
