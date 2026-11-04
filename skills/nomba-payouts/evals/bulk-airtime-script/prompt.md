---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Need a node script (TS fine) that reads users.csv (columns: user_id, phone, network) and sends each user ₦500 airtime via Nomba as a loyalty reward. ~2,000 rows. It must be safe to re-run if it crashes halfway, and nobody should get topped up twice. Write the script.
