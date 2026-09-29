# Domain: Deployment / AWS / Vercel

## Responsibility

Deploy InternSafar (Vercel from sibling; AWS EC2 via handoff packs), Path B vs Path C DB rules, runbooks.

## Central sources (app)

| Path | Role |
|------|------|
| `AGENTS.md` | AWS / RDS routing block (always-on) |
| `.cursor/rules/aws-path-b-no-db.mdc` | Path B no-migrate rule |
| `.cursor/rules/db-migration-no-wipe.mdc` | No wipe migrations |
| `APP-FOLDER-STRUCTURE.txt` | Handoff-oriented tree |
| `scripts/aws-handoff-docs/` | PATH-B / AWS-DEPLOY copies |
| `scripts/build-aws-handoff.ps1` | Builds handoff pack |
| `scripts/SCRIPTS-README.md` | Script catalogue |
| `vercel.json`, `.env.example` | Vercel / env template (never wipe real env) |

## Central sources (workspace folders)

| Folder | Role |
|--------|------|
| `internship-portal-aws-handoff/` | Primary pack (`AWS-DEPLOY.md`, `PATH-B-NO-DB-MIGRATE.txt`, …) |
| `internship-portal-aws-handoff-WITH-SECRETS/` | May contain secrets — never paste them into chat/docs |
| `latets projet cdoe for aws deploy/` | Extra/older handoff copy |
| `aws deploy/`, `Aws deployment documents/` | Guides, runbooks, tarballs |

## Environments ↔ database

| Host | Database |
|------|----------|
| Local + Vercel | **Same** shared Neon |
| Production (`internsafar.com` / AWS) | **Separate** DB only |

Google OAuth callbacks are expected for `localhost:3000`, the Vercel preview host, and `internsafar.com` (`/api/auth/callback/google`).

## Path rules

| Path | DB action |
|------|-----------|
| **B** — app-only AWS update | **No Path C migrate.** Swap app + build + PM2 only. Do not set `IP_ALLOW_DB_MIGRATE`. |
| **C** — fresh empty RDS | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` only. Never Path C on live prod data. |
| Live schema gap on AWS | Explicit **additive** DDL + **blank-fill** temp runner so existing accounts keep working — **not** grandfather flags. Plan (workspace): `aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-2026-09-26.md` |

Path B does **not** mean “never touch RDS.” It means do not run the full migrate/Path C wipe path. If new columns would leave blanks that break gates, fill those values in a controlled one-time step.

## Constraints

- Deploy Vercel **from sibling** only; never from nested mono folder.
- `vercel.json` pins Vercel functions to `regions: ["hnd1"]` (Tokyo) so they sit next to the Tokyo database pooler (2026-09-29; was default `iad1`).
- Help chatbot model: Vercel and AWS `.env` `NVIDIA_MODEL` = `nvidia/nemotron-3-super-120b-a12b` (code default matches; AWS updated 2026-09-29).
- Latest AWS Path B: 2026-09-29, tar `internship-portal-aws-deploy-20260929-1736` (built by `scripts/build-aws-handoff.ps1`, which now also skips `.tmp*` folders and `tmp-*.mjs/cjs`). Rollback copy on EC2: `~/internship-portal-old-20260929-120735`; JSON DB backup in `~/db-backups/`. EC2 has no AWS CLI / `pg_dump` — take RDS snapshots from the AWS console. `mistralai/mistral-nemotron` and most older NIM models return HTTP 410 (retired 2026-09-28).
- Do not commit or chat-dump PEM/secret values.
- Laptop/Vercel migrate refuses AWS RDS hostnames (`assert-db-migrate-target.js`); Path C on EC2 is the empty-RDS path.
- Prefer RDS snapshot before production DDL when rollback is hard.

## Related domains

Database, Auth (env), whole-app release.

## Inspect before modifying

The handoff README/txt for the path in use, and the exact script the user named. Do not invent deploy steps.
