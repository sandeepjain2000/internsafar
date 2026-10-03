# Domain: Database

## Responsibility

Postgres access for InternSafar, `ip_*` schema, SQL migrations, migrate safety gates, runtime `ensure*` schema helpers.

## Central sources

| Path | Role |
|------|------|
| `src/lib/db.js` | `pg` pool — app queries must use **`ip_*` only** |
| `db/migrations/` | Numbered SQL (prefer `*ip*`; latest **`046_ip_offer_withdrawn_status.sql`**) |
| `scripts/MIGRATION_MANIFEST.txt` | Apply order for Path C / sql-only |
| `docs/ip-er-diagram-notes.md` | ER notes (synced through **039**; also see **040–044**) |
| `docs/ip-er-diagram.puml` | PlantUML diagram |
| `scripts/schema-fingerprint-ip.mjs` | Read-only local↔AWS schema compare |
| `scripts/db_exec_sql_file.js` | Applies one SQL file (gated) |
| `scripts/assert-db-migrate-allowed.js` | Blocks migrate unless allowed |
| `scripts/assert-db-migrate-target.js` | Blocks laptop/Vercel migrate against AWS RDS hostnames |
| `scripts/assert-migration-sql-safe.js` | Blocks destructive SQL in new migrations |
| `scripts/deploy-fresh-aws-db.mjs` | Path C fresh/empty RDS |

Useful npm scripts: `db:migrate:ip`, `db:migrate:sql-only`, `db:migrate:workbench`, `db:migrate:pipeline`, partial migrate scripts, `deploy:fresh-aws-db`, `db:check-migration-safety`, `db:check-integrity`.

## Notable recent migrations / runtime schema

| File / ensure | What it adds |
|---------------|----------------|
| `040_ip_help_chat_analytics.sql` | Help-chat analytics |
| `041_ip_email_unsubscribe_requests.sql` | Unsubscribe tokens/requests |
| `042_ip_country_region_fields.sql` | Candidate `country`, employer `hq_country` |
| `043_ip_ref_countries.sql` | `ip_ref_countries` catalog |
| `044_ip_internship_stipend_range.sql` | `ip_internships.stipend_inr_max` (+ CHECK) |
| `045_ip_notification_archive.sql` + `ensureIpNotificationCategorySchema` | `ip_notifications.archived_at` (NULL = Inbox; no blank-fill needed) |
| `046_ip_offer_withdrawn_status.sql` | Widens `ip_offers_status_check` with `withdrawn` (applied to Supabase and AWS 2026-09-29; no blank-fill; app falls back to `expired` on any DB still missing it) |
| `026b_ip_runtime_tables_before_constraints.sql` (2026-10-03) | Additive: creates runtime tables/columns that 027/028 constrain (`ip_users.two_factor_enabled`, `ip_2fa_challenges`, `ip_notification_preferences`, `ip_notifications.meta`) so a fresh migrate no longer fails. No-op on existing DBs |
| `047_ip_captcha_nonces_2fa_attempts.sql` + `ensureIpCaptchaNonceSchema` / `ensureIpTwoFactorSchema` (2026-10-03) | `ip_captcha_nonces` (single-use captcha) + `ip_2fa_challenges.failed_attempts` (default 0). Also created at runtime — optional on AWS, no blank-fill |
| `037`/`038` college-name retire (edited 2026-10-03) | UPDATEs only touch rows with `updated_at` before 2026-09-02 IST, so a replay cannot rewrite newer user edits |
| `ensureIpEmployerDocumentSlotsSchema` | `superseded_at`, `doc_label`, file_size; dedupe; active-type unique index |
| `ensureIpEmployerEmailVerifySchema` | Verify table + `email_verify_required` (**schema only**) |

## Blank-fill (not grandfather flags) — confirmed 2026-09-23

When AWS lacks columns that local/Vercel already have:

1. ADD schema (additive).
2. One-time **temp runner** fills blanks so **existing working accounts keep today’s behaviour** (e.g. set `email_verified_at` where null).
3. New signups use normal app paths.
4. Delete the temp runner after run.
5. **Forbidden:** `email_verify_required=false` (or similar) so code “ignores blanks.”

Workspace plan for next AWS push (outside app tree): `aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-2026-09-26.md`.

## Environments ↔ database

| Host | Database |
|------|----------|
| Local | Shared Supabase Postgres / `DATABASE_URL` from `.env.local` — **transaction pooler, port 6543** (switched 2026-09-29) |
| Vercel (this sibling project) | **Same DB as local**; Vercel `DATABASE_URL` should also use port 6543 (session pooler 5432 caps all processes at 15 → `EMAXCONNSESSION`) |
| Production (`internsafar.com` / AWS) | **Separate** RDS only — no Supabase pooler; unaffected |

Transaction-mode safe: app uses no session features (no session `SET`, temp tables, LISTEN/NOTIFY, named prepared statements). Apply capacity lock is `pg_advisory_xact_lock` inside `BEGIN` (transaction-scoped — OK). `src/lib/db.js` still retries connect on connection-limit errors.

## Constraints

| Situation | Rule |
|-----------|------|
| Path B AWS app-only update | **Never** Path C / full migrate runner |
| Sibling needs columns AWS lacks | Explicit ADD + blank-fill **before** relying on those columns in prod |
| Path C fresh empty RDS | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` only |
| Live schema change | Explicit user request + additive / data-preserving SQL + gates |
| New migration SQL | No `DELETE FROM` / `DROP TABLE` / `TRUNCATE` / wipe-and-reinsert patterns |
| Table invention | Forbidden — read migrations / ER notes first |
| Env files | Never wipe `.env` / `.env.local` |

## Related domains

Auth, all feature domains, Deployment.

## Inspect before modifying

Target migration SQL, migrate gates, ensure helpers, and every query/lib that uses the affected tables. Fingerprint AWS vs local before Path B when schema-touching.
