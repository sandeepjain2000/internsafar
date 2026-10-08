# InternSafar — Project Context Index (Level 1)

Compact map for AI agents. **Not** a full README of the product.  
**Policy refresh:** 2026-10-07: core candidate / employer are off-limits to testing (demos only); QA runs on disposable test accounts re-created by `npm run qa:ensure-test-accounts`; SuperAdmin shared (hard constraint 9, `domains/testing.md` §7).  
**Inspected from live sibling app:** 2026-10-08 (weekly employer documents reminder: `POST /api/ip/cron/employer-docs-reminder`, pending + verified employers with no documents, max 2 sends, tracking table `ip_employer_docs_reminders` (migration 050, PK/FK → `ip_employers`), env switch `IP_EMPLOYER_DOCS_REMINDER_ENABLED` (AWS only), EC2 crontab Monday 10:00 IST, no SuperAdmin button — see `domains/employer.md`, AWS steps in `domains/deployment.md`; My Applications automation: regression IS-084 / TC-IS-08-005 (sort, tabs, counts, search, filters, withdraw) + IS-085 on real data, runner CAND-AP-1/2/ADV no longer pass on page-load — see `domains/testing.md`; core candidate / employer password lock: `ip_users.is_core_account` (migration 049), UI change-password + reset links reply as normal but leave the password and sessions unchanged, backend-only `npm run ip:core-account` — see `domains/auth.md`; regression IS-083 / TC-IS-05-006 — see `domains/testing.md`; on AWS since 2026-10-08 (column + flag, reminder on) — see `domains/deployment.md`; profile labels tied to inputs, preferred hours must be valid times (night shifts allowed) + commitment note 200-char limit via `src/lib/ipProfileSetup.js`, save message names the tab of the problem field — see `domains/candidate.md`; unit `test:profile-setup` + regression IS-082 / TC-IS-06-014 — see `domains/testing.md`; QA sign-in passwords moved out of source into `.env.local` keys `IP_QA_CORE_PASSWORD` / `IP_QA_SUPERADMIN_PASSWORD` — see `domains/testing.md` §4; candidate profile loading + error/Try again state, regression IS-081 / TC-IS-06-013 — see `domains/candidate.md`; candidate profile LinkedIn / GitHub / Portfolio / website / WhatsApp / Telegram validated on form + `PUT /api/ip/candidate/profile` 400 via `src/lib/ipProfileContact.js`, changed values only — see `domains/candidate.md`; unit `test:profile-contact` + regression IS-080 / TC-IS-06-012 — see `domains/testing.md`). Prior: 2026-10-07 (QA: every script records into the workbook, new `qa:test-account-cases` + `qa:temp-employer-cases`, manual-only down to 3, Automation column synced from coverage — see `domains/testing.md`; Incentive-Based postings ignore stipend min/max on create/edit (TC-IS-09-019 fix) — see `domains/employer.md`; candidate First/Middle/Last Name reject digits and symbols — client + `PUT /api/ip/candidate/profile` 400 via `src/lib/ipPersonName.js` — see `domains/candidate.md`; checklist runner, manual runners, integrity check (`-1` = fail) aligned to live, IS-079 / TC-IS-06-011 — see `domains/testing.md`). Prior: 2026-10-03 (Medium audit fixes: 2FA resend bound to `ip_2fa_bind` cookie, hashed password-reset tokens + session revoke, phone change stores national + dial, employer referral credited on email verify — see `domains/auth.md`; `/superadmin/unsubscribes` page + PATCH API, processed unsubscribes suppress non-transactional mail, bulk select-all per page, Set to Pending, reviewer columns, publish needs posting gate, report-error rate limit — see `domains/superadmin.md`; confidential-employer masking on every candidate surface, `?preview=1` removed, own-upload-only CV/photo URLs, completions only from hired — see `domains/candidate.md`; shared status-change helper, IST interview times, atomic export claim, document URL check — see `domains/employer.md`; `ip_schema_migrations` tracking, target guard checks the real URL, migration 048 indexes (not applied), runtime audit columns — see `domains/database.md`; security headers + postinstall skip on Vercel — see `domains/deployment.md`; posting share text = new intro + link + employer description, identical on WhatsApp and LinkedIn, whole-sentence trim to 2900 chars via `src/lib/ipPostingShareText.js` — see `domains/employer.md`; SuperAdmin **Candidates** page `/superadmin/candidates` + detail, read-only, APIs under `/api/ip/superadmin/candidates` — see `domains/superadmin.md`; High audit fixes: single-use captcha, login throttle, 2FA attempt limits, reset-link cap, signup transactions — see `domains/auth.md`; application status transition map, publish points charged in the same transaction as the insert, edit-posting date fix — see `domains/employer.md`; profile save no longer touches education, offers open until 23:59 IST — see `domains/candidate.md`; migrations 026b + 047, 037/038 replay-safe — see `domains/database.md`; deploy-fresh guard + script gates — see `domains/deployment.md`; SuperAdmin QA password separate from core — `scripts/lib/ipCoreSampleConfig.js`. Earlier 2026-10-01: LinkedIn shares open phone share sheet with ready post text, posting-share claim reused while pending instead of 409 — see `domains/employer.md`; edit posting page gains Eligibility tab + Show company identity checkbox, matching create — see `domains/employer.md`; posting working hours use 12-hour AM/PM picker and 12-hour display, storage unchanged — see `domains/employer.md`; city pickers gain "Other (not listed)" free text + Navi Mumbai in catalog, posting work cities accept custom entries, cities route merges missing static cities — see `domains/candidate.md`; employer dashboard Action center shows up to two task tiles side by side; employer candidate detail shows every Excel field — gated email/CV/offers/endorsements, formatted availability; both Excel exports gained preferred locations/roles, availability, commitment label, website — see `domains/employer.md`; candidate Country change clears State/City, non-India free-text place, server rejects country/state mismatch, profile availability date timezone-safe — see `domains/candidate.md`). Prior: 2026-09-30 (flow-trace skills `.agents/skills/ip-trace-*` listed in `SKILLS_MAP.md`; `POST /api/ip/offers` offer write + application `offered` now one transaction, duplicate race → 409; candidate offers list view shows status labels). Prior: 2026-09-29 (Browse one-trip load `useSaved=1` + loading/empty/error states; local DB on Supabase transaction pooler 6543; shared in-progress rule for dashboard/sidebar, applications status guide + apply confirmation, `outdated` report reason, bulk shortlist/reject notifications; sidebar single collapse control + Ctrl/⌘+B, sign-out feedback, Feature ideas + Employer analytics load/error/empty states — see `domains/ui-ux.md`; offer lifecycle: re-offer after decline/expiry, offer closes as `withdrawn` on employer status change (migration 046) — see `domains/workflow-core.md`; AWS production aligned 2026-09-29 (045 + 046 SQL, Path B tar `20260929-1736`, AWS `NVIDIA_MODEL` updated)). Prior: 2026-09-28 (notification Inbox/Archived folders, SA-only delete, applications badge; QA workbook + regression re-sync; SuperAdmin login on `/`). Earlier: 2026-09-26 (Hybrid E docs, SA Reject/Suspend + Adjust Points, HQ Country single-select, stipend range, posting ethics gate; Vercel `82ead1b`).

After this file: open `FOLDER_STRUCTURE.md` to locate paths, then **one** `domains/*.md`, then live source.

All paths below are relative to app root: `internship-portal/` unless marked otherwise.

---

## What is this product?

**InternSafar** (package name `internship-portal`) is a Next.js internship marketplace.

| Role | Portal home | Typical work |
|------|-------------|--------------|
| **candidate** | `/candidate` | Profile, browse/apply, applications, messages, offers, referral, notifications |
| **employer** | `/employer` | Profile/docs, postings, candidate search/workbench, messages, offers, analytics |
| **superadmin** | `/superadmin` | Approvals (incl. Reject/Suspend), documents, Adjust Points, postings oversight, posting share rewards, ideas |

Public/marketing and auth surfaces: `/` (landing + **email/password** sign-in), `/login`, `/register`, `/register/candidate`, `/register/employer`, `/forgot-password`, `/help`, `/ideas`, `/guidelines`, `/how-it-works`, `/account`, referral short links `/r/[code]`, email unsubscribe `/unsubscribe?token=…` (token only — email not in URL). Google OAuth is used for **registration verify** only, not home login.

SuperAdmin signs in on the **same** home form `/` as candidate/employer. `/superadmin/login` is a redirect-only route to `/` (kept for old bookmarks); every role signs out to `/`.

Product DB tables use the **`ip_*`** prefix only on shared Postgres. Do **not** invent or mutate Placement Hub / `ism_*` tables.

---

## Which tree to edit

| Role | Path |
|------|------|
| **Edit + Vercel deploy** | Sibling: `…/UIUX Migration/internship-portal` (this app; has its own `.git`) |
| **Frozen — do not edit or deploy** | `…/UIUX Migration/campus-placement-multiuser/internship-portal` |

If a task says “Internship Portal / InternSafar / IP”, it means the **sibling** tree.

---

## Stack (confirmed from `package.json` + source)

| Area | Stack |
|------|--------|
| App | Next.js `^16.3.0` (`src/app`), React `19.2.4`, **JavaScript** (not TypeScript app code) |
| UI | Tailwind 4, shadcn / Base UI (`components.json`, `src/components/ui`) |
| Auth | NextAuth (`src/lib/auth.js`). **No** `middleware.js`. APIs enforce auth. |
| DB | Postgres via `pg` (`src/lib/db.js`). Migrations: `db/migrations/` (prefer `*ip*`; latest numbered `050_ip_employer_docs_reminders.sql`; apply order in `scripts/MIGRATION_MANIFEST.txt`) |
| Files | AWS S3 (`src/lib/s3.js`), object prefix `internship-portal/…`; download authz helper `src/lib/ipFileAccess.js` |
| Mail | ZeptoMail / SMTP (`src/lib/mail.js`, `zeptomail.js`); outbound footers can append unsubscribe via `src/lib/ipEmailUnsubscribe.js` |
| Help chat LLM | NVIDIA NIM helpers (`src/lib/nvidiaLlm.js`, `/api/ip/help-chat`) |
| Deploy | Vercel from sibling; AWS EC2 via workspace handoff packs |
| QA | Playwright under `qa/` (smoke / regression with journeys / full:release / `qa:e2e:aws` for EC2) + Excel workbook `test-cases/InternSafar-Test-Cases.xlsx` |

### Environments ↔ database (confirmed)

| Host | Database |
|------|----------|
| Local (`npm run dev` → `http://localhost:3000`) | Shared Supabase Postgres / `DATABASE_URL` from `.env.local` (transaction pooler, port 6543) |
| Vercel (preview project for this sibling) | **Same DB as local** |
| Production (`internsafar.com` / AWS) | **Separate** Postgres only |

Deleting or resetting users on local/Vercel affects both of those hosts. It does **not** affect production AWS DB.

---

## Domains → context file → source

| Domain | Context file | Primary source |
|--------|--------------|----------------|
| Auth / sessions | `domains/auth.md` | `src/lib/auth.js`, `src/app/api/ip/auth/`, login/register/account pages |
| Database | `domains/database.md` | `db/migrations/`, `src/lib/db.js`, `docs/ip-er-diagram-notes.md` |
| Candidate | `domains/candidate.md` | `src/app/candidate/`, `src/app/api/ip/candidate/` |
| Employer | `domains/employer.md` | `src/app/employer/`, `src/app/api/ip/employer/` |
| SuperAdmin | `domains/superadmin.md` | `src/app/superadmin/`, `src/app/api/ip/superadmin/` |
| UI / Gemini restyle | `domains/ui-ux.md` | `src/app/**`, `src/components/ip/`, workspace `gemini-tsx-handoff/` |
| Messages / apps / offers | `domains/workflow-core.md` | `api/ip/messages`, `offers`, applications routes + libs |
| AWS / deploy | `domains/deployment.md` | `AGENTS.md` AWS block + workspace handoff folders |
| Testing / regression | `domains/testing.md` (runner map); every case → runner: `domains/testing-case-map.md` (generated) | `test-cases/`, `qa/`, `npm run qa:*` |

Full route/API inventory (large): `ISM_ROUTE_INVENTORY.md` — open only when you need exhaustive route lists.

---

## Hard constraints (do not violate)

1. **Sibling only** for product edits; never edit nested mono `campus-placement-multiuser/internship-portal`.
2. **`ip_*` tables only** — no Placement Hub schema changes from IP work.
3. **Path B AWS app update = no Path C migrate runner.** If sibling code needs columns AWS lacks, do **additive schema + one-time blank-fill** (temp runner) so existing accounts keep working — **not** grandfather flags like `email_verify_required=false`. See `DECISIONS.md`, `domains/deployment.md` → "General runbook", and the newest workspace plan `aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-<date>.md` (latest 2026-10-08). Path C = fresh/empty RDS only with `IP_ALLOW_DB_MIGRATE=1`.
4. **New migrations must not wipe live data** (no DELETE/DROP TABLE/TRUNCATE patterns in new SQL). Gates: `scripts/assert-db-migrate-allowed.js`, `scripts/assert-migration-sql-safe.js`.
5. **Never blank/wipe** `.env` / `.env.local`. Do not push unless the user explicitly asks in that message.
6. **No `middleware.js`** — protect via API session/role checks + `src/components/ip/PortalShell.jsx`.
7. **UI quality** rules live in `AGENTS.md`. `PRODUCT.md` and `DESIGN.md` are **referenced there but missing** in the repo — follow `AGENTS.md` UI block + local UI skills instead of inventing those files unless the user asks to create them.
8. Preserve Playwright IDs, live APIs, and role behaviour unless the user asks to change them.
9. **Never touch core accounts during testing.** Core = exactly three, `PROTECTED_ACCOUNT_EMAILS` in `scripts/lib/ipCoreSampleConfig.js`: SuperAdmin `support@placementhub.online`, candidate `lawsonlclintern+1@gmail.com`, employer `placementhubsupport@gmail.com`. The `+2` / `+3` aliases are seeded filler, **not** core. No test sign-ins, approvals/suspends/rejects, postings, applications, points, documents, messages or SQL writes on the core candidate / employer, whether by Playwright, scripts, agents or manual test steps you give the user — they are for demos only. Testing uses the disposable test accounts in `scripts/lib/ipTestAccountsConfig.js` (`npm run qa:ensure-test-accounts` re-creates them after a reset; Playwright global setup runs it automatically). There is no separate test SuperAdmin: tests use the one SuperAdmin to act on test accounts but never change the SuperAdmin account itself. Details + incident: `domains/testing.md` §7. Separately, the app flags the core candidate / employer with `ip_users.is_core_account` so UI password changes do nothing (`domains/auth.md`).
10. **"Test" / "run all tests" means the whole workbook, never one runner.** Run `npm run qa:all` (unit + all Playwright + checklist runner + deep register scripts + one-off / test-account / throwaway-employer scripts + Excel apply + `qa:coverage --strict`) on a fresh dev server, and report against the workbook total from `npm run qa:coverage` (automated verified / automated not run / manual-only by sheet = all TC-IS cases). Never quote one runner's count as "the total". Splitting into separate runners is fine (server memory, time), but after any runner finishes, run `qa:coverage` and **ask the user whether to run the remaining runners** — never assume testing is finished; say "partial: X of N" meanwhile. Details: `domains/testing.md` §8.

---

## How an AI should work a task

```text
1. Understand the task
2. Pick domain(s) from the table above
3. Check SKILLS_MAP.md / .agents/skills for a matching skill — load only if it matches
4. Read only that domains/*.md file
5. Open the real page / API / lib / migration involved
6. If the change crosses auth, DB, or another role — inspect those contracts too
7. Implement the smallest change that fits existing architecture
8. Verify (lint/build/tests as appropriate — see AGENTS.md “Post-change validation”)
9. Update this ai-context pack in the same task if a feature, route, API, schema, auth rule,
   script, or decision changed (CONTEXT_UPDATE.md) — and always re-check before push/deploy
```

---

## Related paths (outside this pack)

| Need | Where |
|------|--------|
| Folder tree | `FOLDER_STRUCTURE.md` (this pack) |
| Workspace siblings (AWS, Gemini, prompts) | `RELATED_WORKSPACE.md` |
| BRD | `InternSafar_Business_Requirements.txt` (in app) and workspace-root copy |
| Plan / build / verify standing prompts | workspace `Development prompts for cursor to use/` (filenames are swapped vs contents — go by file content) |
| Code review HTML report (self-contained prompt) | `CODE_REVIEW_REPORT_PROMPT.md` — includes full CSS/JS + HTML skeleton; no external `report.html` needed |
| Skills discovery | `SKILLS_MAP.md` |
| Flow-trace skills (employer onboarding, apply→offer, Hybrid E docs, AWS Path B schema gap) | `.agents/skills/ip-trace-*/SKILL.md` — listed in `SKILLS_MAP.md` (added 2026-09-30) |
| Stable decisions | `DECISIONS.md` |

---

## Known gaps (facts, not guesses)

| Item | Status |
|------|--------|
| `PRODUCT.md` / `DESIGN.md` | Named in `AGENTS.md`, **not present** in app root |
| `docs/ai-context/` | **Tracked in git** (pushed to GitHub with the app); excluded from Vercel uploads via `.vercelignore`. `AGENTS.md` requires updating it with feature changes. Zip for offline AI briefing; keep it next to a full app checkout to edit code |
| Handoff-WITH-SECRETS workspace folder | May contain secrets — never paste secret values into chat or into these docs |
| ER notes last full sync | `docs/ip-er-diagram-notes.md` synced through migration **039**; also **040–044** (help-chat analytics, unsubscribe, country/region, `ip_ref_countries`, stipend range) + runtime Hybrid E `superseded_at`/`doc_label` — re-check ER notes when changing schema |
| AWS vs local/Vercel schema | Production RDS is separate. **2026-10-08 ~17:20 IST: 049 (`ip_users.is_core_account` + core flags) and 050 (`ip_employer_docs_reminders`) applied to RDS in one transaction (no blank-fill); AWS code = `cf78513`; weekly documents reminder switched on (EC2 crontab Monday 10:00 IST). AWS schema matches local/Vercel again. Details `domains/deployment.md` → "Latest AWS Path B 2026-10-08"; general steps → "General runbook".** Earlier: re-checked read-only 2026-10-08 ~15:40 IST (only 049 + 050 missing). Re-fingerprinted read-only 2026-10-07: every `ip_*` table and column matches local/Vercel (only the unused local `ip_schema_flags` differs). As of 2026-09-29 the product schema matches local/Vercel (Sep 26 docs/stipend gaps + Sep 29 `archived_at` / offer `withdrawn` applied, no fills needed). Only `ip_schema_flags` is local-only (unused; do not create). Plan: workspace `aws deploy/AWS-PUSH-PLAN-SCHEMA-BACKFILL-2026-09-29.md`. Re-fingerprint before the next schema-touching Path B |
| Code-review remediation (2026-09-18) | Valid **Critical** + Valid **High** (non-a11y) from GPT triage applied on sibling + Vercel preview; **Medium/Low** and all **Accessibility** still open — see `DECISIONS.md` |
