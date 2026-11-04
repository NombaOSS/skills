---
tags: [nomba]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

Django marketplace. Sellers have a balance and can request a withdrawal to their Nigerian bank account (they enter account number + pick a bank). Implement the withdrawal flow with Nomba: the view/service that sends the money and updates the Withdrawal model's status, plus handling for when Nomba later tells us it succeeded or failed. Python 3.12, Django 5.
