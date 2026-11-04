---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Add Nomba payments to my Express + Postgres shop (Node 20, TypeScript). Orders table has id, total_naira (numeric), status, customer_email. I need POST /orders/:id/pay that sends the customer to Nomba to pay, and GET /checkout/callback where Nomba sends them back after paying, which should mark the order paid and show a thank-you page. Write the route file(s).
