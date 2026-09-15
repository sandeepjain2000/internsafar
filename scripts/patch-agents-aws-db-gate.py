#!/usr/bin/env python3
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "AGENTS.md"
text = p.read_text(encoding="utf-8")
start = "<!-- BEGIN:aws-db-script-routing -->"
end = "<!-- END:aws-db-script-routing -->"
i = text.index(start)
j = text.index(end) + len(end)
new = """<!-- BEGIN:aws-db-script-routing -->
# AWS / RDS database scripts (Cursor — read before running any migrate)

**Why a gate exists:** Cursor once ran a DB migrate during Path B (app-only update).
Path B must never touch RDS. Casual `npm run …migrate…` is refused in code until you
explicitly allow writes (`IP_ALLOW_DB_MIGRATE=1` or a confirm CLI flag).

| Situation | Command | Notes |
|-----------|---------|--------|
| **Path B — app code update only** | **Do not run any DB migrate/seed** | Swap app + build + PM2 only. Do **not** set `IP_ALLOW_DB_MIGRATE`. |
| **Path C — fresh / empty AWS RDS** | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` | 001–034 → core demo seed → 035–039 |
| SQL only when demo users **already exist** | `IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only` | File: `db_migrate_sql_only_ip.mjs` |

Hard rules for agents:
1. App update (Path B) → **no** database migration scripts and **no** `IP_ALLOW_DB_MIGRATE`.
2. Fresh RDS → only the Path C command above (env prefix required).
3. Code gate: `scripts/assert-db-migrate-allowed.js` → `=== BLOCKED ===` + exit 1 if not allowed.
4. Success requires `=== OK ===` banners and exit code **0**. `=== FAIL ===` / `=== BLOCKED ===` = stop.
5. Partial scripts (`db:migrate:candidate-academics`, etc.) also go through `db_exec_sql_file.js` and need the same allow.
6. Full write-up: handoff `PATH-B-NO-DB-MIGRATE.txt` and `.cursor/rules/aws-path-b-no-db.mdc`.

<!-- END:aws-db-script-routing -->"""
p.write_text(text[:i] + new + text[j:], encoding="utf-8")
print("Updated AGENTS.md aws-db block")
