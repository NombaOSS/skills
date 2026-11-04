"""Checks that every `nomba.<resource>.<method>(` in the skills' Python code
blocks exists on the published `nomba` client, sync and async.

Run after `node scripts/validate.mjs` and `pip install nomba`.
"""

import json
import sys

import nomba

calls = json.load(open("build/api-calls.json"))["python"]
clients = [
    nomba.Nomba(client_id="x", client_secret="x", account_id="x"),
    nomba.AsyncNomba(client_id="x", client_secret="x", account_id="x"),
]
missing = sorted(
    {
        c
        for c in calls
        for client in clients
        if not callable(getattr(getattr(client, c.split(".")[0], None), c.split(".")[1], None))
    }
)
if missing:
    print(f"✗ not in nomba {nomba.__version__}: {', '.join(missing)}", file=sys.stderr)
    sys.exit(1)
print(f"✓ {len(calls)} Python calls exist in nomba {nomba.__version__} (sync and async)")
