# Database migrations — InternSafar (Internship Portal)

## Overview

- **Engine:** Raw SQL files in `db/migrations/` executed by `scripts/db_exec_sql_file.js`.
- **Not used:** Prisma, Flyway, Knex, or a migration tracking table.
- **Tables:** `ip_*` only. Legacy ISM migrations (`001_ism_schema.sql` … `005_message_unread_student.sql`) are **out of scope** for InternSafar deploy.
- **Latest IP migration:** `038_ip_retire_vishwakarma_vnit_college_names.sql`

## Why 38 files (not one consolidated dump)

Industry practice uses **incremental migration files** during development (Flyway, Prisma, Rails, etc.). Running all 38 in order on a **fresh empty RDS** produces today's schema. A single `pg_dump` baseline is optional convenience for much longer histories — **not required** for this project.

## Migration types

| Range | Type | On empty fresh RDS |
|-------|------|--------------------|
| 001–031 | Schema (tables, columns, constraints) | Required |
| 032–034, 037–038 | Data fixes (company/college names) | Mostly no-ops |
| 035 | Demo academics seed (3 cast candidates) | Optional on prod |
| 036 | Single superadmin seed | Optional — `/api/ip/bootstrap` also ensures superadmin |

Most schema migrations use `IF NOT EXISTS` and are safe to re-run on a partially applied database.

## Fresh RDS setup (on EC2)

1. Follow the AWS runbook Parts A–B (EC2 + private RDS).
2. Create `.env` **on EC2 only** — never upload local `.env` / `.env.local`.
3. Set `DATABASE_URL` to your RDS connection string (see `AWS-DEPLOY.md`).
4. **RDS connection test** (runbook Step 22) before migrating.
5. `npm install --legacy-peer-deps`
6. **`npm run db:migrate:all`** — runs all 38 files in manifest order (replaces runbook Step 23 partial migrate).
7. `npm run db:check-integrity`
8. `npm run build` → PM2 → Nginx (runbook Parts E–G).
9. Visit the app or `POST /api/ip/bootstrap` for superadmin if needed (`support@placementhub.online` / `Admin@123` per README).

## Manifest

See `MIGRATION_MANIFEST.txt` in the **`runner/`** folder (and copies in `migrations/`). SQL files also remain in the extracted app at `db/migrations/`.

## Partial migrate scripts (existing)

These remain in `package.json` for targeted runs; fresh RDS should use `db:migrate:all`:

- `db:migrate:ip` — 001 only
- `db:migrate:workbench` — 016–027
- `db:migrate:company-names` — 032–034
- etc.

## RDS SSL

If Node/pg reports `SELF_SIGNED_CERT_IN_CHAIN`, set (runbook Step 41):

```bash
DATABASE_SSL_CA=/etc/ssl/rds/global-bundle.pem
```

The app reads this via `src/lib/pgSsl.js`.

## Safety

- **Normal deploy does not wipe the database.**
- Do **not** rerun migrations merely because EC2 or RDS rebooted.
- Destructive `recreate.mjs` is runbook **conditional only** (missing tables) — not part of standard deploy.
