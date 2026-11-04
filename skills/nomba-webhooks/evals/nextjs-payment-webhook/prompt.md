---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I'm on Next.js 15 (app router) with Prisma. Customers pay through Nomba checkout and I set our order id as the orderReference. Write the webhook endpoint that Nomba calls so we can mark the Order as PAID (Order has id, amountKobo Int, status). Signing key is in the Nomba dashboard.
