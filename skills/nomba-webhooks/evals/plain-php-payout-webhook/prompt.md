---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

plain php (no framework), mysql via PDO. we send bank transfers through nomba and store them in a `payouts` table (id, merchant_tx_ref, amount, status). write webhook.php that receives nomba's payout notifications and keeps payouts.status right. when a payout definitively fails we must refund the user's wallet (users.wallet_balance) exactly once.
