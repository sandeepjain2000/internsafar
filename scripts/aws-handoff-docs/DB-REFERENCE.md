# Database migrations — InternSafar (Internship Portal)

## Overview

- **Engine:** `scripts/db_exec_sql_file.js` (fail-closed: `=== OK ===` / `=== FAIL ===` / `=== BLOCKED ===`)
- **Allow gate:** `scripts/assert-db-migrate-allowed.js` — refuses unless `IP_ALLOW_DB_MIGRATE=1` (or confirm CLI flag)
- **Manifest:** 40 SQL files (001–039)
- **Why Path B must not migrate:** `PATH-B-NO-DB-MIGRATE.txt`

## Which command

| Situation | Command |
|-----------|---------|
| Path B — app update only | **No DB migrate.** Do not set `IP_ALLOW_DB_MIGRATE`. |
| Path C — fresh / empty RDS | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` |
| Demo users already exist; SQL only | `IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only` |

Casual `npm run deploy:fresh-aws-db` **without** the env prefix exits 1 with `=== BLOCKED ===`.

## Handoff runner (SQL only)

```bash
cd internship-portal-aws-handoff/runner
IP_ALLOW_DB_MIGRATE=1 NODE_PATH=~/internship-portal/node_modules node db_migrate_sql_only_ip.mjs
```

Fresh RDS: use `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` from the extracted app instead.
