# Domain: Testing / QA (case creation + regression)

## Responsibility

InternSafar automated QA, regression, manual test-case creation, and results workbooks.

## Resolved policies (do not re-open unless the owner changes them)

### 1) Workbook source of truth

| File | Role |
|------|------|
| `test-cases/InternSafar-Test-Cases.xlsx` | **Single** InternSafar cases/results SoT |
| `prompts/Testing/boarders_latest_update_test_checklist.xlsx` | **Column/format reference only** — not a second product SoT |

- Write generated/patched InternSafar cases into `InternSafar-Test-Cases.xlsx`.
- Do not fully regenerate the multi-sheet workbook into Boarders *product* types.
- Column schema: Boarders names + InternSafar extras. Shared defs: `scripts/lib/internsafar_xlsx_cols.py`. Migrate once: `npm run qa:migrate-xlsx-cols`.

### 2) Google / preview env (IS-044 class)

- Google on **register** OAuth hop = verification-only (intent → `?gv=`; **no** portal session during consent/return).
- After a successful **Google-path create** (`register-candidate`), the API may return `sessionEstablished: true` and the UI opens the role home immediately (seen on TC-IS-03-019 / 001). Temp password email still sent; email/password on `/` remains valid.
- Google on **home**: disabled (`/?error=GoogleLoginDisabled`). Login is email + password.
- Local and Vercel share the **same** DB — resets on local affect Vercel. Production AWS DB is separate.
- Referral on Google register: `/api/ip/auth/google-intent` stores `referralCode` in httpOnly `ip_google_ref`.
- Each host under test needs matching `NEXTAUTH_URL` + Google OAuth callback for that origin.
- Verify: `scripts/verify-google-auth-hosts.mjs` and/or `qa/tests/google-auth.spec.js`.

Default verify hosts: `http://localhost:3000`, Vercel preview `https://internship-portal-sigma-mauve.vercel.app`, `https://internsafar.com`.

### 3) Help chat / NVIDIA NIM E2E

| Level | Automation |
|-------|------------|
| GET `/api/ip/help-chat` config, empty POST validation, UI launcher/reset | Automated (regression pack) |
| Live NIM successful chat completion | **Manual-only** by default — do not block `qa:e2e` / regression on it |

### 4) Canonical QA 2FA / OTP env vars

Defined for local `.env.local` only (also documented in `.env.example`). **Never commit values; never paste OTP secrets into ai-context.**

| Var | Use |
|-----|-----|
| `IP_QA_2FA_LOGIN_CODE` | Login OTP success |
| `IP_QA_EMAIL_CHANGE_CODE` | Email-change verification |
| `IP_QA_2FA_ENABLE_CODE` | Confirm-enable 2FA |
| `IP_QA_2FA_DISABLE_CODE` | Confirm-disable 2FA |
| `IP_QA_2FA_BYPASS_FOR_TESTING` | `true` enables bypass in scripted flows |
| `IP_QA_2FA_BYPASS_CODE` | Bypass code when bypass enabled |
| `IP_QA_2FA_WRONG_CODE` | Negative OTP tests |
| `IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE` | `1` → employer register JSON includes `qaVerifyUrl` + `qaOutboundMails` (always off when `VERCEL_ENV=production`) |
| `IP_QA_CORE_PASSWORD` | Candidate / employer QA sign-in password (`scripts/lib/ipCoreSampleConfig.js`; env → `.env.local` → core-password CSV; throws if unset). Quote if it contains `#` |
| `IP_QA_SUPERADMIN_PASSWORD` | SuperAdmin QA sign-in password (same lookup). No QA password literals in tracked files (2026-10-08) |

CI: skip OTP success assertions when codes unset, or use bypass. QA sign-ins use the disposable test accounts (§7), never the core candidate / employer.

Employer register E2E (no inbox): `npm run qa:employer-reg-e2e` and deep smoke `npm run qa:register-approve-post-apply`. Both must assert **real credentials login** at gates (fail before verify; succeed pending+verified; SA login; approved login; candidate login+apply). Do not pass on register-only. Flow doc: `docs/qa-employer-register-e2e.md`.

### 5) Industry QA tiers (`qa:e2e*`)

| Tier | When | Command | Scope |
|------|------|---------|--------|
| **Smoke** | Every change / PR | `npm run qa:e2e:smoke` | Auth + Google (minutes) |
| Compat | Legacy alias | `npm run qa:e2e:smoke-latest` | Former ~47 pack (auth + google + `regression.spec.js`) — **not** the nightly gate |
| **Regression** | On demand / nightly | `npm run qa:e2e:regression` | smoke-latest + **journey specs** + screens + mobile, then Excel apply |
| Playwright full | All specs | `npm run qa:e2e:full` | Every `qa/tests/*.spec.js` |
| **Full / release = "all tests"** | Pre-release, or whenever asked to test everything | `npm run qa:all` (= `qa:e2e:full:release`) | Unit scripts + all Playwright + checklist runner + `qa:employer-reg-e2e` + `qa:register-approve-post-apply` + one-off scripts + `qa:test-account-cases` + `qa:temp-employer-cases` + Excel apply + `qa:coverage --strict`; remaining **Manual** Excel is human (§8) |

Suite file lists live in `qa/suites.mjs`. Excel `InternSafar-Test-Cases.xlsx` is the case SoT with Automation = `Automated` | `Manual` | `Obsolete`. Playwright pass count ≠ whole workbook.

Product hygiene (edit/obsolete/add cases vs live `src/`): `npm run qa:sync-xlsx-hygiene` then `npm run qa:audit-xlsx`. Audit notes: `reviews/excel-qa-tier-audit-2026-09-24.md`.

### 6) Email unsubscribe manual / scripted checks

| Command / path | Role |
|----------------|------|
| `npm run test:email-unsubscribe` | Unit/scripted unsubscribe helpers (`scripts/test-ip-email-unsubscribe.mjs`) |
| `npm run test:email-unsubscribe:live` | Live smoke (`scripts/smoke-ip-email-unsubscribe-live.mjs`) |
| Helper scripts (send to / act on the **test** employer) | `send-unsub-test-to-test-employer.mjs`, `simulate-unsub-click-test-employer.mjs`, `send-test-employer-new-applicant-mail.mjs` |

**External tester with GitHub zip only:** needs working `.env.local` with at least `DATABASE_URL` plus mail (`ZEPTOMAIL_*` or `SMTP_*`) to exercise real send + click + PENDING queue. Google client files are **not** required for unsubscribe-only testing. Local and Vercel share the same Neon DB — coordinate before wiping users.

### 7) Core accounts are never touched by testing (owner rule 2026-10-07 — strict)

**Core accounts — exactly these three** (`PROTECTED_ACCOUNT_EMAILS` in `scripts/lib/ipCoreSampleConfig.js`):

| Role | Email |
|------|-------|
| SuperAdmin | `support@placementhub.online` |
| Candidate | `lawsonlclintern+1@gmail.com` (Priya Sharma) |
| Employer | `placementhubsupport@gmail.com` (Nova Labs) |

**Not core:** `lawsonlclintern+2@gmail.com`, `lawsonlclintern+3@gmail.com`, `placementhubsupport+3@gmail.com` (Pulse Media) and any other `+alias`. They are seeded demo filler, so this rule does not protect them. They are also not the test accounts.

**Rules**

- Core candidate and core employer are for **demos only**. Testing never touches them: no test sign-ins, approve / suspend / reject / restore / reset ethics, postings, applications, offers, messages, points, documents, profile edits, password / 2FA / email changes, or SQL writes — whether by Playwright, `qa:*` scripts, agents, or manual test steps given to the user.
- **SuperAdmin is shared (no separate test SuperAdmin).** Tests sign in as the one SuperAdmin to act on **test** accounts (approve / suspend / reject the test employers, moderate test postings) but never change the SuperAdmin account itself (password, 2FA, email, profile).
- Read-only inspection of core rows (diagnosis) is allowed. Demo-data scripts that fill the core accounts (`fill-core-coverage.mjs`, `seed-ip-completed-for-core.mjs`, `generate-ip-test-data.mjs`) are demo use, not testing.
- No transactions as part of testing on core accounts; transactions on core accounts are fine as part of a demo.
- Manual test steps must name a test account, never a core one.
- Applies to every host: local + Vercel (shared DB) and AWS production.

**Test accounts (disposable)** — single source `scripts/lib/ipTestAccountsConfig.js`, password = core QA password (`getCorePasswordForRole`):

| Role | Email | State kept by the ensure script |
|------|-------|----------------------------------|
| Candidate | `lawsonlclintern+qa1@gmail.com` (Ananya Rao) | Complete profile + academics, ≥500 points, one active application on "Data Analyst Intern" |
| Candidate (other) | `lawsonlclintern+qa2@gmail.com` (Kabir Menon) | Complete profile; used as the "other candidate" in ownership checks (CAND-O-7 / CAND-M-5) |
| Employer (approved) | `placementhubsupport+qa1@gmail.com` (Kestrel Analytics) | Approved, email verified, ethics accepted + locked, profile complete, ≥1000 points, two open postings ("Data Analyst Intern", "Frontend Developer Intern", no screening questions, apply window kept open) |
| Employer (pending) | `placementhubsupport+qa2@gmail.com` (Harborline Logistics) | Pending approval, email verified (can sign in) |

- `npm run qa:ensure-test-accounts` (`scripts/ensure-ip-test-accounts.mjs`) creates missing test accounts and repairs existing ones (password, 2FA off, verified email, points, postings). Idempotent; writes only to test accounts.
- `IP_Reset_Core_Sample.js` deletes the test accounts with every other non-core user — expected. Nothing has to be run by hand afterwards:
  - Playwright `qa/global-setup.js` runs the ensure script before every suite (local and `*.vercel.app` targets; skip with `IP_QA_SKIP_ENSURE_TEST_ACCOUNTS=1`).
  - QA entry scripts call `ensureQaTestAccounts(BASE)` from `scripts/lib/ipQaAuth.mjs` (`qa-register-approve-post-apply-smoke.mjs`, `run-internsafar-qa.mjs`, `run-ip-workbench-qa.mjs --live`, `qa-test-account-cases.mjs`, `scripts/manual/run-tc-is-03-013…`).
  - Scripts sign in through `requireQaLogin(base, 'candidate' | 'employer' | 'superadmin')`; when a test account is missing or its password is wrong it throws one clear message ("run `npm run qa:ensure-test-accounts`") instead of failing later on a 401.
  - Cases that suspend / reject / delete / reset ethics or replace documents run on **throwaway employers** the script registers and hard-deletes (`qa-temp-employer-cases.mjs`, `qa-employer-reg-verify-approve-login.mjs`), never on the shared `+qa1` employer.
  - Other hosts (AWS `internsafar.com`) have their own DB: run `npm run qa:ensure-test-accounts` there before testing.
- Guard: `assertNotCoreForTesting()` (in `ipTestAccountsConfig.js`) makes `qa/helpers/login.js` (`apiLogin`, `signInOnHome`) and `scripts/lib/ipQaAuth.mjs` (`apiLogin`) throw on the core candidate / employer email.
- Tests that open, apply to or moderate a posting pick from the test employer's postings (`qa/helpers/testPostings.js` → `testEmployerPublishedPostingIds()`): IS-061, IS-065, IS-066, JOURNEY-CAND-01, JOURNEY-SA-01.

**Incident that set this rule:** 2026-09-29 Nova Labs was suspended and restored while following manual test steps, then rejected the same evening; employer login was blocked on 2026-09-30 (~11:54–12:15 IST) until it was re-approved. Testing had also spent posting points on Nova Labs.

### 8) "Test everything" = whole workbook, one command, one coverage report (owner rule 2026-10-07)

Tests live in several runners — unit scripts, Playwright (`qa/tests`), checklist runner (`run-internsafar-qa.mjs`), deep register scripts, workbench — each with its own case list. None of them alone is "all tests", and a runner's own count (e.g. "250 results") is **not** the workbook total.

- **Command:** `npm run qa:all` (= `qa:e2e:full:release`, `scripts/run-full-release-qa.mjs`): DB-free unit scripts → all Playwright + Excel apply → checklist runner `--apply` (API + browser + TC-IS) → workbench `--live` → `qa:employer-reg-e2e` + `qa:register-approve-post-apply` → one-off scripts (03-013, 03-015) + `qa:test-account-cases` + `qa:temp-employer-cases` → Excel apply → xlsx audit → `qa:coverage --strict`. Start from a fresh `npm run dev` (the dev server leaks memory over the ~1 h run). New unit scripts go into `UNIT_SCRIPTS` in that file.
- **Report:** `npm run qa:coverage` (`scripts/report-internsafar-qa-coverage.py`) reads the workbook and prints: total TC-IS cases; automated (runner / Playwright / both) split into **verified since today** (Pass/Fail/Blocked) and **NOT run since today** (IDs); **manual-only** cases by sheet (no test code — a person must run them). The numbers always add up to the workbook total. `--strict` exits 1 when an automated case was not run since `--since`.
- **Dates are per result:** every result in `qa-results.json` carries its own `executedAt`; carried-over results (`--skip-browser`, `--only`, Playwright apply merging prior runner results) keep their old time, so the workbook's Date Verified never makes a stale result look fresh.
- **Coverage counts legacy IDs:** the checklist runner records many results under its older IDs (AUTH-4, CAND-B-3 …); they map to workbook rows through the Legacy ID column, and the report counts them as runner coverage.
- **Every script writes the workbook** (2026-10-07): deep scripts, one-off runners and the two case scripts record Pass / Fail / Blocked per case through `scripts/lib/recordQaResults.mjs` into `test-cases/qa-results.json` (merged, each result keeps its own `executedAt`), and `--apply-excel` (or the `qa:all` apply step) writes the rows. The coverage report lists them under `SCRIPT_RUNNERS`; ids that need extra setup are in `NEEDS_SETUP` and are not counted by `--strict` (TC-IS-03-015 Google bypass, TC-IS-06-007 emailed code). TC-IS-03-008 (Domain employer register) has been recorded by `qa-employer-reg-verify-approve-login.mjs` on its default `domain` path since 2026-10-10. The workbook writer still skips Blocked / Not Run for `MANUAL_ONLY_TC_IDS` so a skipped run never overwrites a person's result.
- **Manual-only Google-consent register rows = 2** (TC-IS-03-001, 03-006; 03-019 was retired into 03-001 on 2026-10-10). Both could be scripted against a local server with `IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1`. Other manual-only rows are listed by `qa:coverage`.
- **Automation column follows the code:** `npm run qa:coverage -- --sync-automation` sets `Automated` for every id covered by a runner / Playwright / script and `Manual` otherwise (`Obsolete` kept). Run it after adding or removing coverage.
- **Splitting is allowed, assuming is not:** running one runner at a time is fine (dev-server memory, time). After any runner finishes, run `npm run qa:coverage` and **ask the user whether to run the remaining runners**, naming them and the "NOT run" count. Never treat one finished runner as "testing done"; say "partial: X of N" meanwhile.
- **When answering "did you test everything":** quote the coverage report — e.g. "Workbook 259: 255 of 257 automated run today (255 Pass / 0 Fail / 0 Blocked); 0 not run; 2 scripted cases need setup; 2 manual-only, not tested" (2026-10-10, after the weak-check pass and the `/r` fix). Never present manual-only cases as covered.
- **Role-mismatch 403 copy (noted 2026-10-10, not changed):** `requireSession` answers every wrong-role call with "…Sign out, then sign in as SuperAdmin (support@placementhub.online), and retry." even when the route needs a candidate or employer. Tests match on status, not this text.

**Incident that set this rule:** 2026-10-07 the user asked for all tests; runs were split (unit / Playwright / checklist `--skip-browser` / latest-update re-run) and reported as "243 of 250 pass" as if finished, while the workbook has 271 cases (240 automated across runners, 31 manual-only). The user had hit the same subset reporting before.

---

## Runners

| Role | Command | Entry |
|------|---------|-------|
| Create / repair test accounts | `npm run qa:ensure-test-accounts` | `scripts/ensure-ip-test-accounts.mjs` (also run by `qa/global-setup.js`) |
| Playwright e2e | `npm run qa:e2e` | `qa/runners/run-internsafar.mjs` |
| AWS Linux / prod e2e | `npm run qa:e2e:aws` | `qa/runners/run-internsafar-aws.mjs` (bundled Chromium, `IP_BASE=https://internsafar.com`, skip ops probes) |
| Regression + Excel apply | `npm run qa:e2e:regression` | `scripts/run-regression-and-apply-xlsx.mjs` |
| Full / release gate ("all tests") | `npm run qa:all` / `qa:e2e:full:release` | `scripts/run-full-release-qa.mjs` |
| Whole-workbook coverage | `npm run qa:coverage` | `scripts/report-internsafar-qa-coverage.py` |
| Test-account cases (34) | `npm run qa:test-account-cases` | `scripts/qa-test-account-cases.mjs` |
| Throwaway-employer lifecycle (8) | `npm run qa:temp-employer-cases` | `scripts/qa-temp-employer-cases.mjs` |
| Excel product hygiene | `npm run qa:sync-xlsx-hygiene` | `scripts/sync-internsafar-xlsx-product-hygiene.py` |
| Checklist QA | `npm run qa:checklist` / `qa:checklist:apply` | `scripts/run-ip-checklist-qa.mjs` |
| Migrate Excel cols | `npm run qa:migrate-xlsx-cols` | `scripts/migrate-internsafar-xlsx-boarders-cols.py` |
| Patch latest TC-IS rows | `npm run qa:patch-latest-cases` | `scripts/patch-internsafar-latest-cases.py` |
| Install Playwright browsers | `npm run playwright:install` | Persistent `%LOCALAPPDATA%/ms-playwright` |

### Runner map — where every test lives (checked 2026-10-07; counts refreshed 2026-10-10)

Files stay where they are (imports and npm scripts depend on the paths). Every workbook case → runner: **`domains/testing-case-map.md`** (generated, `npm run qa:coverage -- --write-map`).

| Runner | Path | Cases | Writes workbook? | In `qa:all` |
|---|---|---|---|---|
| Unit scripts | `scripts/test-*.mjs` (`UNIT_SCRIPTS` in `run-full-release-qa.mjs`) | code-level, no workbook rows | n/a | yes |
| Playwright | `qa/tests/*.spec.js`; case mapping `scripts/apply-playwright-regression-xlsx.mjs` | 58 TC-IS (all also in the checklist runner) | yes (regression / full apply) | yes |
| Checklist runner | `scripts/run-internsafar-qa.mjs` + `scripts/lib/ipQaFixtureCases.mjs`, `ipQaRemainingSuite.mjs`, `ipQaRemainingExtras.mjs`, `ipQaLatestUpdateCases.mjs`, `ipQaAuth8.mjs` | 204 rows (TC-IS id or Legacy ID) | yes (`--apply`) | yes |
| Workbench | `scripts/run-ip-workbench-qa.mjs` (`--live`) | P0 rule matrix, no workbook rows | no | yes |
| Deep register scripts | `scripts/qa-employer-reg-verify-approve-login.mjs`, `scripts/qa-register-approve-post-apply-smoke.mjs` | 8 (02-028, 02-029, 03-008 on the default `domain` path, 03-025, 03-026, 03-030, 14-024, 18-051) | yes (`--apply-excel`) | yes |
| One-off runners | `scripts/manual/run-tc-is-*.mjs` (03-013, 03-015, 06-007) | 3 | yes (`--apply-excel`); 03-015 / 06-007 only with setup | yes, except 06-007 (emailed code) |
| Test-account cases | `scripts/qa-test-account-cases.mjs` (`--only <ids>`) | 34 (03-027, 05-001, 05-002, 06-002, 07-003, 09-006, 09-019, 09-020, 09-021, 11-001, 11-005, 12-001, 12-002, 12-004, 12-011, 12-012, 13-001, 13-005, 14-010, 14-011, 14-014, 14-015, 14-016, 14-017, 14-029, 14-032, 15-003, 17-007, 18-012, 18-015, 18-016, 18-017, 18-020, 18-053) | yes (`--apply-excel`) | yes |
| Throwaway-employer lifecycle | `scripts/qa-temp-employer-cases.mjs` | 8 (14-005, 14-025, 14-026, 14-027, 14-028, 14-033, 17-006, 18-019) | yes (`--apply-excel`) | yes |
| Not workbook tests | `check-ip-db-integrity.mjs`, `check-ip-candidate-profile-save.mjs` | DB/schema checks | n/a | no |

**Hang guards (regression / full:release / local runner):** invoke `@playwright/test/cli.js` via `process.execPath` with `stdio: 'inherit'` and `shell: false`. JSON reports use `IP_PW_JSON_REPORT` → file + **list** reporter (`playwright.config.js`). Never `--reporter=json` with spawnSync stdout capture, and avoid Windows `npx`+`cmd` nesting (silent buffer).

**Filter UI locators:** decongested list/browse screens use `IpTableFiltersShell` (`.ip-tf__btn` / `.ip-tf__panel`). Shared helper: `qa/helpers/ipTableFilters.js`. Do not assert legacy `.ip-br-drawer` / mobile filter sheets.

Specs under `qa/tests/`: `auth.spec.js`, `google-auth.spec.js`, `regression.spec.js`, `journeys-candidate.spec.js`, `journeys-employer.spec.js`, `journeys-superadmin.spec.js`, `screens.spec.js`, `mobile-candidate-internships.spec.js`, `session-refresh.spec.js`.

**Baseline product notes (2026-09-25):** Posting Share Rewards (not LinkedIn promos / Viral SA UI); withdraw then re-apply allowed while posting open (IS-065/066 on the test candidate + test employer postings; no posting is seeded — if none is open the test fails with "run npm run qa:ensure-test-accounts"); session-refresh in regression suite; SA dashboard metric labels are definitional (not one shared “pending”).

**Workbook re-sync (2026-09-28):** `scripts/sync-internsafar-xlsx-2026-09-28.py` removed retired rows (candidate form path, employer manual requests / Google domain register, SA Form Registrations / Manual Requests queues, resume links, viral), rewrote stale rows (SA on `/`, core accounts, six candidate profile tabs + required phone, browse tabs Unapplied default, xlsx/zip exports, approvals tabs), added email-verify / Hybrid E / sticky approval / Suspend-Restore-Reject / Reset Ethics / ethics lock / Adjust Points / Publish-last-tab cases. Regression IS-067…IS-078 cover the automatable ones (mapping in `scripts/apply-playwright-regression-xlsx.mjs`). Audit: `reviews/excel-qa-tier-audit-2026-09-28.md`.

**Workbook re-sync (2026-10-07):** `scripts/sync-internsafar-xlsx-2026-10-07-test-accounts.py` (preview by default, `--apply` writes) switched Preconditions / steps / notes / Index to the test accounts (pending employer → `+qa2`) and rewrote the wrong-role rows (TC-IS-04-002, TC-IS-14-001, TC-IS-18-048) to expect the "Wrong account for this workspace" block. Actual Result history and TC-IS-18-034 (bootstrap keeps cores) keep the core emails on purpose. The xlsx generator / hygiene / patch scripts now write test-account wording too.

**Workbook cleanup (2026-10-10):** `scripts/sync-internsafar-xlsx-2026-10-10-redundancy-cleanup.py` (preview by default, `--apply` writes) took the workbook from **278 → 259** cases. Only cases another kept case fully covers were retired; that kept case's check was strengthened in the same change, and its Comments / Notes say "Cleanup 2026-10-10: also covers retired …". The script also rewrote overlapping rows so each says its own scope and names the other case, recounted the Index, cleared the stale Legacy ID EMP-I-8 on TC-IS-18-012, and pruned the retired ids + legacy keys from `qa-results.json`.

| Retired | Now covered by (strengthened check) |
|---|---|
| 04-009 `/superadmin/login` redirect | 02-014 — AUTH-15 checks signed out (home form, no `#sa-email`) **and** signed in as candidate (replaces to `/` — home never auto-routes signed-in users — with no SuperAdmin form or links) |
| 02-002 generic login error | 02-023 — wrong password and unknown email must return the identical "Invalid email or password" |
| 02-021 login report rows | 14-014 — test-candidate wrong password: "Password Form (Bad Pass)"; success = "Password Form". 02-023 — `ip_login_events` has "Inactive account" and "Unknown account" for those attempts. 14-026 / 14-027 — "Employer suspended" / "Employer rejected" events |
| 03-019 / 03-022 | 03-001 (manual Google round trip) / 03-002 (REG-C-2, same non-Gmail 400 **and** no `ip_users` row created; one-off runner deleted) |
| 08-004 dashboard cards | 08-003 — CAND-D-1: Reward points tile equals the profile API `points`, Profile score shows `N%`, active applications is a number, every shortcut href returns 200 |
| 11-008 remind | 18-017 — candidate must get "Reminder: offer awaiting your response" |
| 11-012 rating before completion | 11-018 — always rates one not-yet-hired application of the test employer (must 400 "only allowed after the candidate is hired…"), plus the internId pair judged by its real status (400 unless hired/completed, then 201/409) |
| 11-016 / 11-017 accept / decline API | 11-001 (UI accept → hired + employer notice) / 11-002 — CAND-O-2 now also checks offer `declined` + employer "Offer declined" |
| 14-022 SuperAdmin no Notifications | 18-028 — SHELL-1 checks rendered sidebars per role (no missing / foreign links), mobile drawer, SuperAdmin has no notifications link |
| 18-008 / 18-009 posting gates | 18-051 (every gate, exact 403 text, drafts too) |
| 18-014 employer candidate page | 10-001 — owned-application profile (email, `contact_gated` false, phone hidden per `employerCanSeeCandidatePhone`), note 201 + listed, empty note 400, reminder 201 + listed (both deleted), non-searchable stranger 404. 09-020 opens `/employer/candidates/{id}?applicationId=` and requires This application / Private notes / Timeline / Follow-up reminder cards. Invites: 18-015 |
| 18-030 home email-only | 02-024 (home email form + no Google button, folded in) + 02-026 |
| 18-032 captcha everywhere | 02-022 login, 03-012 employer register (REG-E-5, wrong captcha on **both** Domain and Free-email), 02-009 forgot password (AUTH-10 now one check: bad / empty email 400 + wrong captcha 400), 01-009 candidate register has no captcha |
| 18-037 badges | 18-033 — NAV-1 inserts a notice: badge +1, PATCH read, badge back (notice deleted) |
| 01-008 / 18-031 | weak (page load / `ip_users` table exists); `/guidelines` covered by 01-004 + IS-030 |

**QA password redaction (2026-10-10):** `scripts/sync-internsafar-xlsx-2026-10-10-redact-qa-password.py` (preview by default, `--apply` writes) replaced the plain QA password in every cell of the main workbook and the dated exports with `<IP_QA_CORE_PASSWORD>`, and `<IP_QA_SUPERADMIN_PASSWORD>` after the SuperAdmin email. The values live only in `.env.local`. Older sync scripts write the placeholders too (09-28 SuperAdmin lines fixed). `Admin@1234` stays — it is the throwaway register-fixture password, not a real account.

**Retirement audit (2026-10-10, same day):** every retired row's Expected text was compared with live code and the kept runners, using the testing prompts (Prompts pack below). Gaps found and closed: login-report reasons (02-021), dashboard points / score tiles (08-004), always-tested rating gate (11-012), no user row on non-Gmail register (03-022), full-page sections (18-014), Free-email captcha (18-032), and the academics **save** — no runner had ever called the PUT (06-006 drives the profile tab UI, not the academics endpoint). 07-002 keeps start date in its filter list (07-023 only checks the option exists).

Other weak checks fixed in the same pass: ACA-1 (06-005) is a role guard plus a save round trip on the test candidate (same rows PUT back → 200 and unchanged; graduation year 1800 → 400; first-row CGPA 150 → 400 "99.99"; employer PUT 403); 07-016 checks every item's `match_score` against minMatch 1 / 100 and that postings without skills score 100; 07-020 requires numeric 0–100 scores on browse items; 09-014 reads `internship.eligibility` and requires skills / requirements / ideal text, description, location and status to round-trip with employer points unchanged (draft deleted); ERR-1 (18-025) requires 400 "Invalid JSON" with no stack trace (415 no longer passes). Legacy keys the runner no longer records: PERM-9, AUTH-2, AUTH-22, EMP-C-1, EMP-I-4, EMP-I-5, EMP-I-8, REGX-1/2/3, HELP-1, RATE-2, OFF-R-1, REG-E-1.

**Weak-check pass (2026-10-10, same day):** 15 kept checks passed on "page loaded", "API 200" or an always-true condition. Each now checks the row's Expected Result:
- PUB-6 (01-006) `/r/DEMO123` → `/register?ref=DEMO123`, `/r/` → `/register` (found 2026-10-10: `/r/` 308s to `/r`, which had no page → 404, so the blank-code branch in `src/app/r/[code]/page.js` never ran; fixed the same day with `src/app/r/page.js` → `redirect('/register')`); PUB-7 (01-007) `/app` → `/` guest, `/candidate`, `/employer`, `/superadmin` per role; PERM-1 (04-001) `/candidate`, `/candidate/profile`, `/employer`, `/account` signed out **all** land on `/` (was `||`).
- AUTH-5 (02-004) decodes the real login token (local `NEXTAUTH_SECRET`, `next-auth/jwt`), checks `rememberMe` false / true, then re-signs it with an older `authTime`: unchecked 11h signed in, 13h signed out; checked 13h signed in, 31d signed out. `apiLogin(base, email, pw, { rememberMe })` sends the flag.
- ACCT-3 (05-003) flips one category's email switch, confirms only that category changed, restores, employer PUT 403 (the old body `{channel, enabled}` was ignored by the API). The duplicate GET-only ACCT-3 in the API suite was removed (`assess` keeps only the last result per key).
- CAND-P-3 (06-003) throwaway incomplete candidate (hard-deleted): first login `milestone_1`, after POST `shown` → `already_shown_for_this_login_count`, profile complete → `complete`; the test candidate → `complete`; UI: no "Complete your profile" banner on the dashboard.
- CAND-X-1 (06-004) real `.xlsx` (content type, `candidate-portal-export.xlsx`, PK bytes) + employer 403 + guest 401 in **one** assess (the second assess used to overwrite the candidate half).
- PTS-1 (13-002) every ledger row for default_signup / profile_complete / application_spend / first_application_bonus / posting_spend / referral_bonus carries its fixed amount (whole DB), one-time awards never twice per user (the old check read `ledger` / `entries`; the API returns `items`). 13-004 checks each row's `balance_after` against the running sum, header balance = profile points, and balance = ledger sum on every account created through sign-up (seeded test accounts get opening points outside the ledger).
- EMP-H-1 (18-004) approved employer vs the pending test employer (`placementhubsupport+qa2`): API `approvalStatus`, pending POST internships 403 "must be approved by SuperAdmin before posting", UI approval alert / enabled Post button / verified line. SA-PR-1 (14-012) SuperAdmin claims API + candidate 403 + "Posting Share Rewards" heading + no `/superadmin/viral` nav link. EMP-V-1 (no workbook row) `/employer/viral` → `/employer/referral`, viral API 200 with referral code, candidate 403.
- MAIL-1 (18-027) requires the server's `mailOverrideActive` to match this host's env (Blocked when the override is off); recipients are proven by `npm run test:mail-override` (real recipient **and** override copy).
- 09-011 exports a hidden-phone and a visible-phone applicant inline: `.xlsx` phone cell follows `employerCanSeeCandidatePhone`, CV ZIP holds `applicants.xlsx` (+ `resumes/` = `resumeCount`), empty selection 400. 17-004 file gate on the thread folder (missing key): both participants 404, pending employer 403, outsider upload 404, empty upload 400 — no file written.
- `assessUiStrict` (checklist runner): a real UI mismatch fails the case after an API Pass; only a page still on `/` counts as a sign-in wait.

**Script cases (2026-10-07)** — browser helpers in `scripts/lib/ipQaBrowser.mjs` (`launchQaBrowser`, `newQaPage`, `gotoReady`, `clickUntil`, `fillMathCaptcha`):
- Both scripts restore what they change: points net to zero, the test report row and posting drafts are deleted, threads archived before the run are re-archived, throwaway employers are hard-deleted (`hardDeleteIpUser`).
- Messages: only the employer inbox has the Select All / Archive Selected bar; the candidate inbox archives per thread. Both restore the last tab from saved prefs, so the script switches to All first.
- Notifications loading label: employer "Please Wait…", candidate "Loading notifications…".
- A new employer gets one free published post; later publishes need points, so post-restore checks use a draft (same approval gate).
- **Deep checks replace page-load-only runner rows (2026-10-08).** 25 workbook rows used to pass in the checklist runner on "page loaded" or "API 200" alone. They now live in the two scripts and check the row's Expected Result: profile tabs + Privacy toggle saved to `ip_candidates`; Browse List/Cards, empty state, 390px fit; analytics numbers vs API; message send/reply/unread/archive (role-specific, SuperAdmin 403); offer remind 429/404/403, the Share/Decline/Accept dialogs, accept → hired + employer notice; referral link/copy/clipboard and referral bonus (+25 ledger row, then reverted); notifications folders / mark-all-read / mobile search; `/account` tabs + preference round-trip + dialogs (accessible name, Close focusable, not clipped); ideas categories, vote hit-test, long detail wrap, SuperAdmin status/comment → author notice; posting part-time/incentive fields stored and shown; candidate search saved to table prefs, invite needs a posting; SA documents approve/reject notices, postings search, login-report failed row + tabs + KPI tiles. The runner no longer records those legacy IDs (CAND-P-2, CAND-B-3, CAND-M-1/2, CAND-O-1/5, CAND-R-1, CAND-N-2, ACCT-1/2, IDEA-3, EMP-I-8, EMP-C-2, EMP-M-1, EMP-O-1, EMP-AN-1, EMP-R-1, EMP-N-1, SA-A-1, SA-DOC-1, SA-PO-1, SA-L-1/2, SA-M-1, SA-I-1). Every write is reverted (offer/application status, ledger, notices, threads, docs, ideas, prefs, privacy column).
- Selector notes (2026-10-10, after the 2026-10-09 accessibility pass): `IpToast` puts `role="status"` on a separate always-present sr-only span, not on the visible toast box — find the box by its class and check the status region has the same text; toast `innerText` ends with the "×" dismiss button; toast text can match twice (box + status span), so use `.first()`; SuperAdmin Adjust Points Add / Deduct are `role="tab"`. TC-IS-12-011 now unarchives every inbox thread in `finally` if it fails between Archive and Unarchive. TC-IS-03-008 expects "Employer register — review email" instead of "New employer registered" when the register response has `softFail` (the throwaway `.example` domains always do).
- Selector notes: the Next route announcer is `role="alert"` — check page testids, not `[role=alert]`; the ideas page defaults to Cards (`.ip-ci-card h3 button`); the offers toast is `.ip-of-toast` (no role); the posting edit page uses sentence case ("Weekly hours") while the new page uses Title Case — match case-insensitively; candidate search saves `q` to table prefs only after prefs have loaded.
- **TC-IS-09-019 found a product bug (fixed 2026-10-07):** an Incentive-Based draft was rejected with "Stipend maximum must be greater than or equal to the minimum" when the hidden Fixed min / max were still filled (10000 / 5000). The posting APIs now skip the range check for incentive and store NULL; the pages no longer send the hidden values (`domains/employer.md`).

**Role-gate assertions:** wrong-role visits show the `PortalShell` block page and the URL stays (decision in `DECISIONS.md`). Assert the block text + no other-role nav links, never a redirect (`auth.spec.js`, `session-refresh.spec.js`, PERM-2).

**Checklist runner aligned to live (2026-10-07)** — `scripts/run-internsafar-qa.mjs` + `scripts/lib/ipQaFixtureCases.mjs`:
- Retired flows assert **410**, never 200: candidate `register-candidate path:'form'` (REG-C-4/11, TC-IS-03-004/017), employer `manualRequest` (REG-E-4), SA `/api/ip/superadmin/form-registrations` + `/requests` (SA-F-1/2/3, SA-R-1/2/3). Their pages redirect to `/superadmin/approvals` (browser SA-F-3 / SA-R-1, regression IS-071). No fixture writes `form_approval_status` or `ip_employer_requests` (both dropped).
- Candidate register checks use the Google path: bad email / non-Gmail → 400 before the token gate; googlemail and duplicate stop at the Google-token 401 (409 needs live consent or local `IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1`).
- Employer register checks send full fields: missing field / 7-char password / bad captcha / Domain without website → 400. TC-IS-03-009 (free mailbox on Domain path) expects a **soft-flagged pending** account — it creates one throwaway employer only while the outbound mail override is on, then hard-deletes it.
- AUTH-11: password-reset confirm revokes every session of that user, so the runner re-logs in the test candidate after the reset-back and asserts the old cookie is dead.
- EMP-P-3: the test employer's ethics are locked, so a partial ethics PUT must return 403 "locked" and the profile stays complete.
- Manual one-shots (`scripts/manual/README.md`): TC-IS-03-007 / 011 runners deleted (retired); 013 uses the test employer on Free-email; 015 reports Blocked unless the Google bypass is on. The 03-022 runner was deleted 2026-10-10 (REG-C-2 / TC-IS-03-002 sends the same request).
- Every run (full, `--skip-browser`, `--only <IDs>`) merges into `test-cases/qa-results.json`; earlier records stay with their own `executedAt`, so anything not re-run today shows as NOT run in `qa:coverage`. `--only` accepts `AUTH-8` or one `TC-IS-…` (02-023 / 06-006 / 12-010). TC-IS-02-023 (login matrix) records **Fail** with every branch's outcome when any branch fails, and since 2026-10-10 also requires wrong password and unknown email to return the identical "Invalid email or password"; a missing `IP_QA_2FA_LOGIN_CODE` only skips the good-code step (2026-10-10: its 7 Oct "Blocked" was two test bugs — SuperAdmin tried with the candidate password, and the 2FA helper answered the captcha with a fixed 7 — not app errors). Then `python scripts/apply-internsafar-qa-xlsx.py` writes the workbook.
- Browser `visible(page, sel)` passes when **any** match is visible. It used to check only the first match; on Browse and Messages the first match is hidden, which made CAND-B-3 / CAND-M-1 fail on loaded pages (2026-10-07; not server load, as first assumed).
- The Next dev server leaks memory over a full run (~30 min API + browser + TC-IS); restart it between long suites if it gets near OOM, or browser cases fail on timeouts that are not product bugs.

**DB integrity check** (`scripts/check-ip-db-integrity.mjs`): a check whose table/column is missing (count `-1`) now **fails** and is listed under `missing_schema` — it no longer passes silently. The retired `ip_employer_requests` dangling checks were removed.

**Candidate name rule (2026-10-07, BUG-PROFILE-001):** `npm run test:person-name` (`scripts/test-ip-person-name.mjs`, unit, DB-free) + regression **IS-079** → **TC-IS-06-011** (API 400 on digits/symbols in First/Middle/Last, name unchanged, inline UI error clears on a valid name). Row added by `scripts/sync-internsafar-xlsx-2026-10-07-name-validation.py` (`--apply`).

**Candidate links / handles rule (2026-10-08):** `npm run test:profile-contact` (`scripts/test-ip-profile-contact.mjs`, unit, DB-free, in `qa:all` unit list) + regression **IS-080** → **TC-IS-06-012** (API 400 on bad LinkedIn / web link / WhatsApp / Telegram, values unchanged, valid bare LinkedIn stored with `https://` and Telegram with `@` then restored, inline UI error clears). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-profile-contact.py` (`--apply`).

**Candidate profile labels / hours (2026-10-08):** `npm run test:profile-setup` (`scripts/test-ip-profile-setup.mjs`, unit, DB-free, in `qa:all` unit list) + regression **IS-082** → **TC-IS-06-014** (API 400 on a non-time hours value / long note, night-shift 22:00–02:00 saved then restored; `getByLabel('First Name')` + `aria-describedby` error; night-shift hours show no inline error; bad Telegram on Privacy blocks Save on Basics with "(on the Privacy & Photo tab)" and Go to focuses Telegram). Since 2026-10-09 only the four setup tabs are numbered (header "Setup step X of 4"); Privacy & Photo and Endorsements (Read-Only) are unnumbered behind an "Optional" divider (`.ip-cp-tabs__split`, aria-hidden, not a tab) — TC-IS-06-002 checks the numbering, the divider position, the "Setup step 1 of 4" header and no step header on Privacy. Workbook text for TC-IS-06-001/002/012/014 rewritten by `scripts/sync-internsafar-xlsx-2026-10-09-profile-step-count.py` (`--apply`). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-profile-a11y-hours.py` (`--apply`).

**My Applications (2026-10-08):** regression **IS-084** → **TC-IS-08-005**: seven fixed applications built with the real `decorateCandidateApplication` (one per status + an Awaiting Review row on a closed posting), served by `page.route` on `GET /api/ip/candidate/applications`; saved filters (`table-filter-prefs`, `list-presets`) are stubbed so the test never reads or overwrites the test candidate's saved views. Checks the four metric cards, all four sorts (exact row order), every status tab, search (company, role any case, no-match empty state + Clear Status Filters), Filters panel (Employer, Status, Next step, Applied from, chip count, Clear), Withdraw enabled only on Awaiting Review rows, and the detail dialog (interview next step, no Withdraw on non-applied). **IS-085** → **TC-IS-08-001 / 08-002** on real data: API items match `decorateCandidateApplication`, employer gets ≥400, search narrows, dialog `aria-modal` + `aria-labelledby` title, × and backdrop close with no stuck overlay. Checklist runner `CAND-AP-1` / `CAND-AP-2` now do the same search + dialog checks (UI result replaces the API Pass; no applications → CAND-AP-2 Blocked), and `CAND-AP-ADV` checks the Filters panel has Status + Next step (a missing button is a Fail, not a skipped Pass). Escape does not close the dialog and focus is not moved into it — not asserted (owner to decide). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-applications-list.py` (`--apply`).

**Change password mismatch (2026-10-09):** regression **IS-086** → **TC-IS-05-007** on the test candidate. `/account` password form is `noValidate`: an empty or different Confirm New Password shows "✗ Passwords do not match" (`#ip-ac-confirm-match`) and `data-testid="account-password-error"`, focuses the confirm box (`aria-invalid`); the error clears while typing; Clear Form removes both. Fails if any request reaches `/api/ip/auth/change-password` (password never changed). Row added by `scripts/sync-internsafar-xlsx-2026-10-09-account-password-mismatch.py` (`--apply`).

**Back after sign-out (2026-10-09):** regression **IS-087** → **TC-IS-02-030** on the test candidate. The test launches its own Chromium with `ignoreDefaultArgs: ['--disable-back-forward-cache']` (falls back to `channel: 'chrome'`), because Playwright's default launch disables the back/forward cache and never hits the bug. It counts `pageshow` restores with `persisted` in `sessionStorage` and fails if Back did not come from that cache, so it cannot pass by accident. Steps: signed-in Back from `/help` stays on `/candidate/offers`; Sign out → Back lands on `/?next=%2Fcandidate%2Foffers` with no "Signing out…"; typed `/candidate/messages` → `/?next=%2Fcandidate%2Fmessages`. Confirmed it fails with the `PortalShell` `pageshow` listener removed. Row added by `scripts/sync-internsafar-xlsx-2026-10-09-signout-back.py` (`--apply`).

**Core account password lock (2026-10-08):** regression **IS-083** → **TC-IS-05-006**. Local DB only (skipped when `IP_BASE` is remote). Flags the second **test** candidate (`TEST_CANDIDATE_OTHER`) with `scripts/ip-core-account.mjs --mark`, checks a wrong current password is still 400, a change and a reset-link confirm both return the normal success while the stored hash keeps the old password, the link cannot be reused, then unmarks and confirms a normal change works; `finally` unmarks and restores the test password. Never flags or signs in as the real core accounts. Row added by `scripts/sync-internsafar-xlsx-2026-10-08-core-account-lock.py` (`--apply`).

**Candidate profile load state (2026-10-08):** regression **IS-081** → **TC-IS-06-013** (route-fails `GET /api/ip/candidate/profile` with 500 → `data-testid="profile-load-error"` panel, no form; unroute + `profile-retry` → form loads). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-profile-load-state.py` (`--apply`).

**Unit scripts and the `@/` alias:** plain `node` can't resolve `@/lib/...`. Unit scripts call `registerAppAlias()` from `scripts/lib/registerAppAlias.mjs` (Node `module.registerHooks`) before importing `src/` files; pass `stubs` (e.g. `@/lib/db` → data: URL) to keep them DB-free (`test-ip-mail-override.mjs`, `test-ip-email-unsubscribe.mjs`, `check-ip-candidate-profile-save.mjs`).

AWS vs local: `qa/docs/AWS-QA-NOTES.txt`. Playbook: `qa/docs/internsafar-runner-playbook.md`.

## Prompts pack

Two folders, both listed file by file in `RELATED_WORKSPACE.md` (Testing prompts library):

- In-app `internship-portal/prompts/Testing/` (local; typically gitignored with other prompt packs): `Use the manual-test-case-generator.txt`, `test-case-generation-prompts.txt`, `backend_qa_prompt v3.pdf`, `frontend_qa_prompt v3.pdf`, format-reference workbooks.
- Workspace `UIUX Migration/prompts/`: `PROMPT (QA test plan and test making).md`, `test-case-generation-prompts.docx`, `Use the manual-test-case-generator.docx`, `SKILL.md(test plan generation).docx`, `SKILL.md(test generation).docx`, `PROMPT (Code review v3 - test+lint execution).docx`.

Use them when adding, auditing or retiring workbook cases: every case traces to code-visible behaviour, covers happy / negative / edge / permission paths, no duplicates. Before retiring a case, confirm each promise in its Expected text is checked by a kept case's runner code (see "Retirement audit (2026-10-10)" under Workbook cleanup).

## Coverage gaps to-do (found 2026-10-10 — future work)

Read-only sufficiency check of the 259-case workbook against the prompts pack and live `src/` (60 pages, 117 API routes) on **2026-10-10**. Mix was healthy (57% negative / error expectations vs the ≥40% skill target; all types present; 257 automated), but these live features had no case or only a token one. Planned: about 35–45 new cases, taking the workbook to roughly 295–300. **No cases were added on 2026-10-10** — this list was recorded only.

When a row is done, set its Status to `Done YYYY-MM-DD` and name the new TC-IS IDs. Do not delete rows, so it stays clear what was open on 2026-10-10 and what was closed later. Re-check live `src/` before writing cases (features may have changed since).

| # | Area (state on 2026-10-10) | Add | Status |
|---|---|---|---|
| 1 | SuperAdmin Candidates list, detail and export (`/superadmin/candidates`, `/superadmin/candidates/[id]`, `api/ip/superadmin/candidates/**`; in SA sidebar) — 0 cases | 3–4 | Open (2026-10-10) |
| 2 | SuperAdmin Email unsubscribes page (`/superadmin/unsubscribes`, `api/ip/superadmin/unsubscribe-requests`) + unsubscribing from a valid email link (`api/ip/unsubscribe`) — only TC-IS-18-047 (no token → "Link not valid") | 3–4 | Open (2026-10-10) |
| 3 | Candidate viewing an employer's page (`/candidate/employers/[id]`, `api/ip/candidate/employers/[id]`) — 0 cases | 2 | Open (2026-10-10) |
| 4 | Emails sent on events (14 subjects in code) — almost none checked by name: offer letter, offer accepted / declined, offer reminder, completion, temporary password, email change, phone change | 6–8 | Open (2026-10-10) |
| 5 | In-app notices (12 of 18 `notifyUser` titles never named): offer received, completion, posting moderation, idea status, posting share verified / not verified, saved internship closing soon, auto-reject | 5–6 | Open (2026-10-10) |
| 6 | Scheduled jobs: `cron/auto-reject-expired`, `cron/daily-progress-report`, `cron/employer-docs-reminder` — only TC-IS-18-038 (cron secret on schedule-reminders / export-jobs) | 3 | Open (2026-10-10) |
| 7 | Employer: edit an internship (`/employer/internships/[id]/edit`), applicant timeline (`applications/[id]/events`), background export status (`export-jobs/[id]`), candidate CV download (`candidates/[id]/download`), profile export — thin or none | 4–5 | Open (2026-10-10) |
| 8 | Viral share verification (now under Refer & earn; `api/ip/viral`, `viral/[id]`, `viral/process-due`) — only the retired-page redirect (TC-IS-14-031) | 1–2 | Open (2026-10-10) |
| 9 | Mobile width, performance basics, double-submit — 8, 1 and 7 cases | 4–5 | Open (2026-10-10) |

Also noted 2026-10-10: many rows give the Expected Result but leave steps to the runner scripts; the frontend / backend QA prompts expect fresher-level manual steps (fine for automation, weak as a manual handoff).

## Skills

`manual-test-case-generator`, `webapp-testing`, `tdd`; Cursor rules `test-plan-generation`, `test-data-generation` when present.

## Constraints

- Sibling `internship-portal` only.
- Confirm against live `src/` — do not invent cases for missing features.
- Never blank `.env.local` or paste OTP secrets into docs.

## Inspect before modifying

`InternSafar-Test-Cases.xlsx`, runners, `qa/tests/*`, `qa/helpers/accounts.js`, `scripts/lib/ipTestAccountsConfig.js`, related `scripts/lib/ipQa*.mjs`, `docs/qa-employer-register-e2e.md`, `.env.example`.
