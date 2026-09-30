---
name: ip-trace-aws-path-b-schema-gap
description: Plan or check an InternSafar AWS production update (Path B app swap) when the sibling code needs schema that AWS RDS lacks — read-only fingerprint, additive DDL, one-time blank-fill so existing accounts keep working, temp runner removal, tar build, swap, smoke, rollback. Use for any AWS push, schema diff between Supabase and RDS, or backfill question. Never use for Path C on live data.
---

# Trace AWS Path B with a schema gap + one-time blank-fill

Read first:

- `internship-portal/docs/ai-context/domains/deployment.md` and `domains/database.md`
- `internship-portal/AGENTS.md` — "AWS / RDS database scripts" block
- `internship-portal/scripts/aws-handoff-docs/PATH-B-NO-DB-MIGRATE.txt`, `AWS-DEPLOY.md`, `DB-REFERENCE.md`
- Latest workspace plan (outside the app): `UIUX Migration/aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-<date>.md` — newest is the template (2026-09-29 at time of writing)
- `internship-portal/docs/ai-context/DECISIONS.md`

## Invariants

- **Path B = app swap + `npm install` + build + PM2 restart. No migrate runner, no `IP_ALLOW_DB_MIGRATE`, no Path C.**
- Path C (`IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db`) is for a **fresh empty** RDS only.
- Path B does **not** mean "never touch RDS". If new code reads columns AWS lacks, apply **explicit additive DDL** first, then a **one-time fill** of blanks with values that keep today's behaviour.
- **Forbidden:** grandfather flags (e.g. `email_verify_required = false`), dual "legacy" semantics, permanent guards that paper over blank columns.
- New SQL must be additive and data-preserving: no `DELETE FROM`, `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, wipe-and-reinsert. Gate: `scripts/assert-migration-sql-safe.js` (`npm run db:check-migration-safety`).
- Laptop/Vercel migrate refuses RDS hostnames (`scripts/assert-db-migrate-target.js`).
- Temp fill/runner scripts are deleted after use and must **not** ship in the tar.
- Local and Vercel share one DB (Supabase); AWS RDS is separate. Changes on one do not reach the other.
- Never paste secrets, PEM contents, or `.env` values into chat, docs, or the AI context pack. Never blank `.env`.
- Deploys and pushes only when the owner explicitly asks in that message.

## Workflow (trace in this order)

1. **Scope the diff** — code changed since the last AWS tar (see latest plan + `domains/deployment.md` "Latest AWS Path B"). Build from the **working tree** if that is what Vercel runs; list untracked files the build needs.
2. **Find schema the code needs** — every `ADD COLUMN` / `CREATE TABLE` / `CREATE INDEX` / CHECK change in `db/migrations/` (order: `scripts/MIGRATION_MANIFEST.txt`) and in runtime `src/lib/ensureIp*.js` helpers.
3. **Read-only compare** — `node scripts/schema-fingerprint-ip.mjs` against local and against AWS (on EC2 or with the AWS URL, read-only). Separate real gaps from noise (e.g. RDS `*_not_null` constraint naming). Note tables retired on purpose (`ensureIpRetireDeadQueuesSchema`) — do not recreate.
4. **For each gap, answer in one row:** column/table · which code reads it · what happens if deployed without it (does an `ensure*` self-create it? does a gate read the blank?) · rows affected on AWS · fill needed? · fill value that restores today's behaviour.
5. **Hidden backfill check** — changed gate files (`src/lib/auth.js`, `src/lib/ipEmployerPostingGate.js`, `src/lib/ipEmployerEmailVerify.js`, approval/document asserts) compared EC2 vs local; existing AWS accounts must keep logging in and posting exactly as before.
6. **Non-schema risks** — env var **names** added, env **values** that now break (e.g. retired model id), `package.json`/lockfile, cron (`scripts/run-ip-daily-progress-cron.sh`), files outside the app folder (`DATABASE_SSL_CA`).
7. **Write the plan** in `UIUX Migration/aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-<date>.md` using the latest plan's sections (gaps, backfills, non-schema, tar contents, execution order, rollback, owner decisions). **Stop for owner approval.**
8. **Execute (only after approval), hard order:** re-fingerprint (stop if different) → RDS snapshot from AWS console (EC2 has no AWS CLI / `pg_dump`; take a JSON backup if no snapshot) → DDL + fill in **one transaction** via a temp runner → verify → delete runner → remove temp files locally → `scripts/build-aws-handoff.ps1` → copy tar → Path B swap/build/restart → smoke → roll back immediately if the build fails.
9. **After deploy** — update `domains/deployment.md`, `domains/database.md`, `PROJECT_INDEX.md` known-gaps row; rebuild `docs/internsafar-ai-context.zip`.

## Fill design rules

- Fill **only** the new blanks the gates read, with the value that matches how the product already treated those rows (precedent: `email_verified_at = now()` for existing working employers, 2026-09-23).
- Scope the `UPDATE` precisely (`WHERE <new_col> IS NULL AND <rows that existed before deploy>`); make it idempotent so a re-run changes nothing.
- Record before/after counts in the plan.
- New signups after deploy use the normal app path — the fill never runs again.
- If NULL already equals today's behaviour (e.g. `ip_notifications.archived_at` NULL = Inbox) → **no fill**, say so explicitly.

## State layers — keep them separate when reporting

| Layer | Evidence |
|-------|----------|
| Schema present on AWS | fingerprint output |
| Blanks filled | before/after counts of the fill query |
| App code deployed | tar name + EC2 folder + PM2 status |
| App actually healthy | smoke results (HTTP 200s, 401s not 500s, error log quiet) |
| Accounts unaffected | gate-file checksums + per-role login/posting reasoning |

Do not report "deployed" when only the schema step ran, or "fixed" when only the tar was built.

## Edge cases to check

- **Replay:** run the fill twice → second run updates 0 rows. `ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` are no-ops on re-run.
- **Mixed old/new rows:** rows created between the fill and the swap (old code still live) — decide if they need the fill too.
- **Old code between SQL and swap:** confirm old code ignores the new columns / never writes the new values.
- **Ensure helpers on first request:** they may ALTER/dedupe under load on AWS — prefer applying that DDL in the planned step.
- **CHECK widening** (e.g. offer `withdrawn`): code fallback (`expired`) during the gap mislabels rows → apply before swap.
- **Timezone:** fill timestamps with `now()` (TIMESTAMPTZ); never hand-type IST strings.
- **Rollback:** additive DDL needs no revert; swap rollback = move the old app folder back + `pm2 restart internsafar`; env rollback = restore the `.env` backup.

## Out of scope

- Path C / fresh database builds.
- Vercel deploys (sibling folder only, separate request).
- Re-designing verification or approval rules to avoid a fill.
- Editing the nested `campus-placement-multiuser/internship-portal` copy or deploying from it.
- Committing or pushing (only when the owner asks in that message).
