---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

I'm adding Nomba to our FastAPI backend (Python 3.12). Write a small `nomba_service.py` module plus two routes: GET /wallet/balance returning our parent account balance, and GET /wallet/transactions returning every transaction from the last 30 days (there can be thousands). Creds should come from env. Also write a short NOTES.md on how to point it at production later.
