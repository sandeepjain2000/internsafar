# Domain: Database

## Responsibility

Postgres access for InternSafar, `ip_*` schema, SQL migrations, migrate safety gates.

## Central sources

| Path | Role |
|------|------|
| `src/lib/db.js` | `pg` pool — app queries must use **`ip_*` only** |
| `db/migrations/` | Numbered SQL (47 files as of 2026-09-18; prefer `*ip*`) |
| `docs/ip-er-diagram-notes.md` | ER notes (synced through **039**; also see **040**, **041**) |
| `docs/ip-er-diagram.puml` | PlantUML diagram |
| `scripts/db_exec_sql_file.js` | Applies one SQL file (gated) |
| `scripts/assert-db-migrate-allowed.js` | Blocks migrate unless allowed |
| `scripts/assert-db-migrate-target.js` | Blocks laptop/Vercel migrate against AWS RDS hostnames |
| `scripts/assert-migration-sql-safe.js` | Blocks destructive SQL in new migrations |
| `scripts/deploy-fresh-aws-db.mjs` | Path C fresh/empty RDS |

Useful npm scripts: `db:migrate:ip`, `db:migrate:sql-only`, `db:migrate:workbench`, `db:migrate:pipeline`, partial migrate scripts, `deploy:fresh-aws-db`, `db:check-migration-safety`, `db:check-integrity`.

## Notable recent migrations

| File | What it adds |
|------|----------------|
| `040_ip_help_chat_analytics.sql` | Help-chat analytics |
| `041_ip_email_unsubscribe_requests.sql` | `ip_email_unsubscribe_tokens`, `ip_email_unsubscribe_requests` (`PENDING` \| `PROCESSED`) |

Runtime may also `ensureIpEmailUnsubscribeSchema` from `src/lib/ipEmailUnsubscribe.js` (additive `CREATE IF NOT EXISTS` — still prefer migration for Path C / empty RDS).

## Environments ↔ database

| Host | Database |
|------|----------|
| Local | Shared Neon / `DATABASE_URL` from `.env.local` |
| Vercel (this sibling project) | **Same DB as local** |
| Production (`internsafar.com` / AWS) | **Separate** DB only |

## Constraints

| Situation | Rule |
|-----------|------|
| Path B AWS app-only update | **Never migrate** |
| Path C fresh empty RDS | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` only |
| Live schema change | Explicit user request + additive / data-preserving SQL + gates |
| New migration SQL | No `DELETE FROM` / `DROP TABLE` / `TRUNCATE` / wipe-and-reinsert patterns |
| Table invention | Forbidden — read migrations / ER notes first |
| Env files | Never wipe `.env` / `.env.local` |

## Related domains

Auth, all feature domains, Deployment.

## Inspect before modifying

Target migration SQL, migrate gates, and every query/lib that uses the affected tables.
