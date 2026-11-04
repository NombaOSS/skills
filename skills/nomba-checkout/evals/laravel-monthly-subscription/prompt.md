---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

We're building a Laravel 11 app with a monthly plan (₦7,500/month). At signup the customer should pay the first month with their card and we save the card; then every month a scheduled job charges the saved card automatically. Using Nomba. Write the controller, the job and whatever model/migration changes are needed.
