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
- Latest AWS Path B: 2026-10-01 15:48 IST, tar `internship-portal-aws-deploy-20261001-1547` (app-only, no schema change; same code as Vercel prod). Ships: LinkedIn share via phone share sheet (Android text + link, iPhone link only), promo claim reuse, and stale-chunk errors after a deploy reload the page once instead of emailing ops (`ClientOpsErrorGuard`, `global-error.js`). Code is git `0119940`. Rollback `~/internship-portal-old-20261001101800` (15:22 build).
- Vercel prod + GitHub `main` ahead of AWS (2026-10-01 ~17:00 IST, app-only, no schema change, **not on AWS yet**): posting link return-after-sign-in + candidate notice, wrong-role message, posting share Copy Link, mobile Live badge nowrap, share dialog mobile overflow fix; candidate posting detail shows every employer field (dates, apply-by, degrees, min CGPA) with `—` for blanks; help bot/Help page cover the shared-link flow (bot reply cap 400 tokens, stray `ACTIONS` stripped); chat launcher lifted above mobile Apply/Save bars; tab icon (`src/app/icon.png`, `favicon.ico`); `hardDeleteIpUser` savepoint fix. Captcha bypass is `false`.
- **Deploy method from 15:48 IST: build-then-swap.** Extract tar to `~/internship-portal-build-<stamp>`, copy live `.env`, `npm install` + `npm run build` there while the live app keeps serving, then `mv` live → `~/internship-portal-old-<stamp>`, `mv` build → `~/internship-portal`, `pm2 restart`. Swap-to-ready ≈ 5 s (was ≈ 2 min when building after the swap). Build failure leaves the live app untouched.
- Tar policy (owner request): keep only `…20261001-1222` (24-hour time box build) + the latest deployed tar; delete the rest (`…1330`, `…1424`, `…1522`, Aug `internsafar.tar.gz` deleted). Rollback folders `…074526`, `…085511`, `…095236`, `…101800` still on EC2 (disk 41%).
- Previous AWS Path B: 2026-10-01 15:24 IST, tar `…20261001-1522` (LinkedIn share change); a client hit a stale-chunk ops alert during its 2-minute build window.
- Previous AWS Path B: 2026-10-01 14:27 IST, tar `internship-portal-aws-deploy-20261001-1424` (app-only, no schema change; git `04d4f4c`; employer edit-posting now has Eligibility tab + "Show company identity" like create).
- Previous AWS Path B: 2026-10-01 13:32 IST, tar `internship-portal-aws-deploy-20261001-1330` (app-only; working hours picker reworked to typeable 12-hour box + AM/PM toggle + clock popover). EC2 tidy 2026-10-01 14:05 IST (owner request): only live `~/internship-portal` + rollback `~/internship-portal-old-20261001074526` (12:22 build, 24-hour time box) kept, plus tars `…20261001-1222` and `…20261001-1330`; older app folders, tars and Sep handoff packages deleted (disk 42% → 30%). 29 Sep code is no longer on EC2 — use git `d23bf2a`. Earlier same day: tar `…20261001-1313` (12-hour display, removed "Tabbed form…" copy; no schema change, AWS has 1 draft posting with `10:00` start — no fill needed). Earlier same day: tar `…20261001-1222` (app-only; schema already identical to Supabase apart from unused `ip_schema_flags`; ships 30 Sep offer fixes, employer candidate detail/Excel parity, candidate location rules, 2-tile Action center, city "Other" + Navi Mumbai, register-employer captcha messages). Rollback copy on EC2: `~/internship-portal-old-20261001065849` (29 Sep code). `~/path-b-swap-build.sh` runs with `set -e` and curls localhost the instant PM2 restarts — that curl can fail (exit 7) even when the build is fine; poll `/login` for 200 before treating the swap as failed. Previous: 2026-09-29 tar `…20260929-1736`, rollback `~/internship-portal-old-20260929-120735`; JSON DB backup in `~/db-backups/`. EC2 has no AWS CLI / `pg_dump` — take RDS snapshots from the AWS console. `mistralai/mistral-nemotron` and most older NIM models return HTTP 410 (retired 2026-09-28).
- Do not commit or chat-dump PEM/secret values.
- Laptop/Vercel migrate refuses AWS RDS hostnames (`assert-db-migrate-target.js`); Path C on EC2 is the empty-RDS path.
- Prefer RDS snapshot before production DDL when rollback is hard.

## Related domains

Database, Auth (env), whole-app release.

## Inspect before modifying

The handoff README/txt for the path in use, and the exact script the user named. Do not invent deploy steps.
