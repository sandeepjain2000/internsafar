# Database migrations — InternSafar (Internship Portal)

## Overview

- **Engine:** `scripts/db_exec_sql_file.js` (fail-closed: `=== OK ===` / `=== FAIL ===` / `=== BLOCKED ===`)
- **Allow gate:** `scripts/assert-db-migrate-allowed.js` — refuses unless `IP_ALLOW_DB_MIGRATE=1` (or confirm CLI flag)
- **Manifest:** 40 SQL files (001–039)
- **Why Path B must not migrate:** `PATH-B-NO-DB-MIGRATE.txt`

## Live data rule

Migrations for an **existing / live** database must keep data intact.
Do **not** use delete-and-insert or truncate-and-insert to refresh or replace live rows.
Prefer additive SQL and in-place / idempotent updates.
`IP_ALLOW_DB_MIGRATE=1` allows the gated migrate flow — it does **not** authorize wiping live data.
Path C is for a **genuinely fresh/empty** RDS only — never to wipe production.

## Which command

| Situation | Command |
|-----------|---------|
| Path B — app update only | **No DB migrate.** Do not set `IP_ALLOW_DB_MIGRATE`. |
| Existing / live RDS — schema change | Only when explicitly requested; **data-preserving** SQL only (inspect files first). |
| Path C — fresh / empty RDS | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` (**empty RDS only**) |
| Demo users already exist; SQL only | `IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only` (not auto-safe for live prod) |

Casual `npm run deploy:fresh-aws-db` **without** the env prefix exits 1 with `=== BLOCKED ===`.

## Handoff runner (SQL only)

```bash
cd internship-portal-aws-handoff/runner
IP_ALLOW_DB_MIGRATE=1 NODE_PATH=~/internship-portal/node_modules node db_migrate_sql_only_ip.mjs
```

Fresh RDS: use `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` from the extracted app instead.
