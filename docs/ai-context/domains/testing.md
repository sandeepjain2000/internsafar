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

- **Command:** `npm run qa:all` (= `qa:e2e:full:release`, `scripts/run-full-release-qa.mjs`): DB-free unit scripts → all Playwright + Excel apply → checklist runner `--apply` (API + browser + TC-IS) → workbench `--live` → `qa:employer-reg-e2e` + `qa:register-approve-post-apply` → one-off scripts (03-013, 03-022, 03-015) + `qa:test-account-cases` + `qa:temp-employer-cases` → Excel apply → xlsx audit → `qa:coverage --strict`. Start from a fresh `npm run dev` (the dev server leaks memory over the ~1 h run). New unit scripts go into `UNIT_SCRIPTS` in that file.
- **Report:** `npm run qa:coverage` (`scripts/report-internsafar-qa-coverage.py`) reads the workbook and prints: total TC-IS cases; automated (runner / Playwright / both) split into **verified since today** (Pass/Fail/Blocked) and **NOT run since today** (IDs); **manual-only** cases by sheet (no test code — a person must run them). The numbers always add up to the workbook total. `--strict` exits 1 when an automated case was not run since `--since`.
- **Dates are per result:** every result in `qa-results.json` carries its own `executedAt`; carried-over results (`--skip-browser`, `--only`, Playwright apply merging prior runner results) keep their old time, so the workbook's Date Verified never makes a stale result look fresh.
- **Coverage counts legacy IDs:** the checklist runner records many results under its older IDs (AUTH-4, CAND-B-3 …); they map to workbook rows through the Legacy ID column, and the report counts them as runner coverage.
- **Every script writes the workbook** (2026-10-07): deep scripts, one-off runners and the two case scripts record Pass / Fail / Blocked per case through `scripts/lib/recordQaResults.mjs` into `test-cases/qa-results.json` (merged, each result keeps its own `executedAt`), and `--apply-excel` (or the `qa:all` apply step) writes the rows. The coverage report lists them under `SCRIPT_RUNNERS`; ids that need extra setup are in `NEEDS_SETUP` and are not counted by `--strict` (TC-IS-03-008 live Google consent, TC-IS-03-015 Google bypass, TC-IS-06-007 emailed code). The workbook writer still skips Blocked / Not Run for `MANUAL_ONLY_TC_IDS` so a skipped run never overwrites a person's result.
- **Manual-only now = 3 rows** (TC-IS-03-001, 03-006, 03-019): Google-consent register flows. 03-001 / 03-006 could be scripted against a local server with `IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1`; 03-019 needs a real Google account.
- **Automation column follows the code:** `npm run qa:coverage -- --sync-automation` sets `Automated` for every id covered by a runner / Playwright / script and `Manual` otherwise (`Obsolete` kept). Run it after adding or removing coverage.
- **Splitting is allowed, assuming is not:** running one runner at a time is fine (dev-server memory, time). After any runner finishes, run `npm run qa:coverage` and **ask the user whether to run the remaining runners**, naming them and the "NOT run" count. Never treat one finished runner as "testing done"; say "partial: X of N" meanwhile.
- **When answering "did you test everything":** quote the coverage report — e.g. "Workbook 271: 241 of 268 automated run today (238 Pass / 1 Fail / 2 Blocked); 25 Playwright cases not run yet; 2 scripted cases need setup; 3 manual-only, not tested". Never present manual-only cases as covered.

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
| Test-account cases (11) | `npm run qa:test-account-cases` | `scripts/qa-test-account-cases.mjs` |
| Throwaway-employer lifecycle (6) | `npm run qa:temp-employer-cases` | `scripts/qa-temp-employer-cases.mjs` |
| Excel product hygiene | `npm run qa:sync-xlsx-hygiene` | `scripts/sync-internsafar-xlsx-product-hygiene.py` |
| Checklist QA | `npm run qa:checklist` / `qa:checklist:apply` | `scripts/run-ip-checklist-qa.mjs` |
| Migrate Excel cols | `npm run qa:migrate-xlsx-cols` | `scripts/migrate-internsafar-xlsx-boarders-cols.py` |
| Patch latest TC-IS rows | `npm run qa:patch-latest-cases` | `scripts/patch-internsafar-latest-cases.py` |
| Install Playwright browsers | `npm run playwright:install` | Persistent `%LOCALAPPDATA%/ms-playwright` |

### Runner map — where every test lives (checked 2026-10-07)

Files stay where they are (imports and npm scripts depend on the paths). Every workbook case → runner: **`domains/testing-case-map.md`** (generated, `npm run qa:coverage -- --write-map`).

| Runner | Path | Cases | Writes workbook? | In `qa:all` |
|---|---|---|---|---|
| Unit scripts | `scripts/test-*.mjs` (`UNIT_SCRIPTS` in `run-full-release-qa.mjs`) | code-level, no workbook rows | n/a | yes |
| Playwright | `qa/tests/*.spec.js`; case mapping `scripts/apply-playwright-regression-xlsx.mjs` | 50 TC-IS | yes (regression / full apply) | yes |
| Checklist runner | `scripts/run-internsafar-qa.mjs` + `scripts/lib/ipQaFixtureCases.mjs`, `ipQaRemainingSuite.mjs`, `ipQaRemainingExtras.mjs`, `ipQaLatestUpdateCases.mjs`, `ipQaAuth8.mjs` | 216 rows (TC-IS id or Legacy ID) | yes (`--apply`) | yes |
| Workbench | `scripts/run-ip-workbench-qa.mjs` (`--live`) | P0 rule matrix, no workbook rows | no | yes |
| Deep register scripts | `scripts/qa-employer-reg-verify-approve-login.mjs`, `scripts/qa-register-approve-post-apply-smoke.mjs` | 7 (02-028, 02-029, 03-025, 03-026, 03-030, 14-024, 18-051) | yes (`--apply-excel`) | yes |
| One-off runners | `scripts/manual/run-tc-is-*.mjs` (03-013, 03-015, 03-022, 06-007) | 4 | yes (`--apply-excel`); 03-015 / 06-007 only with setup | yes, except 06-007 (emailed code) |
| Test-account cases | `scripts/qa-test-account-cases.mjs` (`--only <ids>`) | 11 (03-027, 09-019, 09-020, 09-021, 12-011, 12-012, 13-005, 14-029, 14-032, 17-007, 18-053) | yes (`--apply-excel`) | yes |
| Throwaway-employer lifecycle | `scripts/qa-temp-employer-cases.mjs` | 6 (14-025, 14-026, 14-027, 14-028, 14-033, 17-006) | yes (`--apply-excel`) | yes |
| Not workbook tests | `check-ip-db-integrity.mjs`, `check-ip-candidate-profile-save.mjs` | DB/schema checks | n/a | no |

**Hang guards (regression / full:release / local runner):** invoke `@playwright/test/cli.js` via `process.execPath` with `stdio: 'inherit'` and `shell: false`. JSON reports use `IP_PW_JSON_REPORT` → file + **list** reporter (`playwright.config.js`). Never `--reporter=json` with spawnSync stdout capture, and avoid Windows `npx`+`cmd` nesting (silent buffer).

**Filter UI locators:** decongested list/browse screens use `IpTableFiltersShell` (`.ip-tf__btn` / `.ip-tf__panel`). Shared helper: `qa/helpers/ipTableFilters.js`. Do not assert legacy `.ip-br-drawer` / mobile filter sheets.

Specs under `qa/tests/`: `auth.spec.js`, `google-auth.spec.js`, `regression.spec.js`, `journeys-candidate.spec.js`, `journeys-employer.spec.js`, `journeys-superadmin.spec.js`, `screens.spec.js`, `mobile-candidate-internships.spec.js`, `session-refresh.spec.js`.

**Baseline product notes (2026-09-25):** Posting Share Rewards (not LinkedIn promos / Viral SA UI); withdraw then re-apply allowed while posting open (IS-065/066 on the test candidate + test employer postings; no posting is seeded — if none is open the test fails with "run npm run qa:ensure-test-accounts"); session-refresh in regression suite; SA dashboard metric labels are definitional (not one shared “pending”).

**Workbook re-sync (2026-09-28):** `scripts/sync-internsafar-xlsx-2026-09-28.py` removed retired rows (candidate form path, employer manual requests / Google domain register, SA Form Registrations / Manual Requests queues, resume links, viral), rewrote stale rows (SA on `/`, core accounts, six candidate profile tabs + required phone, browse tabs Unapplied default, xlsx/zip exports, approvals tabs), added email-verify / Hybrid E / sticky approval / Suspend-Restore-Reject / Reset Ethics / ethics lock / Adjust Points / Publish-last-tab cases. Regression IS-067…IS-078 cover the automatable ones (mapping in `scripts/apply-playwright-regression-xlsx.mjs`). Audit: `reviews/excel-qa-tier-audit-2026-09-28.md`.

**Workbook re-sync (2026-10-07):** `scripts/sync-internsafar-xlsx-2026-10-07-test-accounts.py` (preview by default, `--apply` writes) switched Preconditions / steps / notes / Index to the test accounts (pending employer → `+qa2`) and rewrote the wrong-role rows (TC-IS-04-002, TC-IS-14-001, TC-IS-18-048) to expect the "Wrong account for this workspace" block. Actual Result history and TC-IS-18-034 (bootstrap keeps cores) keep the core emails on purpose. The xlsx generator / hygiene / patch scripts now write test-account wording too.

**Script cases (2026-10-07)** — browser helpers in `scripts/lib/ipQaBrowser.mjs` (`launchQaBrowser`, `newQaPage`, `gotoReady`, `clickUntil`, `fillMathCaptcha`):
- Both scripts restore what they change: points net to zero, the test report row and posting drafts are deleted, threads archived before the run are re-archived, throwaway employers are hard-deleted (`hardDeleteIpUser`).
- Messages: only the employer inbox has the Select All / Archive Selected bar; the candidate inbox archives per thread. Both restore the last tab from saved prefs, so the script switches to All first.
- Notifications loading label: employer "Please Wait…", candidate "Loading notifications…".
- A new employer gets one free published post; later publishes need points, so post-restore checks use a draft (same approval gate).
- **TC-IS-09-019 found a product bug (fixed 2026-10-07):** an Incentive-Based draft was rejected with "Stipend maximum must be greater than or equal to the minimum" when the hidden Fixed min / max were still filled (10000 / 5000). The posting APIs now skip the range check for incentive and store NULL; the pages no longer send the hidden values (`domains/employer.md`).

**Role-gate assertions:** wrong-role visits show the `PortalShell` block page and the URL stays (decision in `DECISIONS.md`). Assert the block text + no other-role nav links, never a redirect (`auth.spec.js`, `session-refresh.spec.js`, PERM-2).

**Checklist runner aligned to live (2026-10-07)** — `scripts/run-internsafar-qa.mjs` + `scripts/lib/ipQaFixtureCases.mjs`:
- Retired flows assert **410**, never 200: candidate `register-candidate path:'form'` (REG-C-4/11, TC-IS-03-004/017), employer `manualRequest` (REG-E-4), SA `/api/ip/superadmin/form-registrations` + `/requests` (SA-F-1/2/3, SA-R-1/2/3). Their pages redirect to `/superadmin/approvals` (browser SA-F-3 / SA-R-1, regression IS-071). No fixture writes `form_approval_status` or `ip_employer_requests` (both dropped).
- Candidate register checks use the Google path: bad email / non-Gmail → 400 before the token gate; googlemail and duplicate stop at the Google-token 401 (409 needs live consent or local `IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1`).
- Employer register checks send full fields: missing field / 7-char password / bad captcha / Domain without website → 400. TC-IS-03-009 (free mailbox on Domain path) expects a **soft-flagged pending** account — it creates one throwaway employer only while the outbound mail override is on, then hard-deletes it.
- AUTH-11: password-reset confirm revokes every session of that user, so the runner re-logs in the test candidate after the reset-back and asserts the old cookie is dead.
- EMP-P-3: the test employer's ethics are locked, so a partial ethics PUT must return 403 "locked" and the profile stays complete.
- Manual one-shots (`scripts/manual/README.md`): TC-IS-03-007 / 011 runners deleted (retired); 013 uses the test employer on Free-email; 022 is candidate-only; 015 reports Blocked unless the Google bypass is on.
- Partial re-runs: `--skip-browser` and `--only <IDs>` merge into the existing `test-cases/qa-results.json` (earlier results kept); a full run replaces it. `--only` accepts `AUTH-8`, one `TC-IS-…` (06-006 / 12-010), or `CAND-B-3,CAND-M-1` (candidate page loads, `CANDIDATE_PAGE_CASES`). Then `python scripts/apply-internsafar-qa-xlsx.py` writes the workbook.
- Browser `visible(page, sel)` passes when **any** match is visible. It used to check only the first match; on Browse and Messages the first match is hidden, which made CAND-B-3 / CAND-M-1 fail on loaded pages (2026-10-07; not server load, as first assumed).
- The Next dev server leaks memory over a full run (~30 min API + browser + TC-IS); restart it between long suites if it gets near OOM, or browser cases fail on timeouts that are not product bugs.

**DB integrity check** (`scripts/check-ip-db-integrity.mjs`): a check whose table/column is missing (count `-1`) now **fails** and is listed under `missing_schema` — it no longer passes silently. The retired `ip_employer_requests` dangling checks were removed.

**Candidate name rule (2026-10-07, BUG-PROFILE-001):** `npm run test:person-name` (`scripts/test-ip-person-name.mjs`, unit, DB-free) + regression **IS-079** → **TC-IS-06-011** (API 400 on digits/symbols in First/Middle/Last, name unchanged, inline UI error clears on a valid name). Row added by `scripts/sync-internsafar-xlsx-2026-10-07-name-validation.py` (`--apply`).

**Candidate links / handles rule (2026-10-08):** `npm run test:profile-contact` (`scripts/test-ip-profile-contact.mjs`, unit, DB-free, in `qa:all` unit list) + regression **IS-080** → **TC-IS-06-012** (API 400 on bad LinkedIn / web link / WhatsApp / Telegram, values unchanged, valid bare LinkedIn stored with `https://` and Telegram with `@` then restored, inline UI error clears). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-profile-contact.py` (`--apply`).

**Candidate profile load state (2026-10-08):** regression **IS-081** → **TC-IS-06-013** (route-fails `GET /api/ip/candidate/profile` with 500 → `data-testid="profile-load-error"` panel, no form; unroute + `profile-retry` → form loads). Row added by `scripts/sync-internsafar-xlsx-2026-10-08-profile-load-state.py` (`--apply`).

**Unit scripts and the `@/` alias:** plain `node` can't resolve `@/lib/...`. Unit scripts call `registerAppAlias()` from `scripts/lib/registerAppAlias.mjs` (Node `module.registerHooks`) before importing `src/` files; pass `stubs` (e.g. `@/lib/db` → data: URL) to keep them DB-free (`test-ip-mail-override.mjs`, `test-ip-email-unsubscribe.mjs`, `check-ip-candidate-profile-save.mjs`).

AWS vs local: `qa/docs/AWS-QA-NOTES.txt`. Playbook: `qa/docs/internsafar-runner-playbook.md`.

## Prompts pack

`internship-portal/prompts/Testing/` (local; typically gitignored with other prompt packs).

## Skills

`manual-test-case-generator`, `webapp-testing`, `tdd`; Cursor rules `test-plan-generation`, `test-data-generation` when present.

## Constraints

- Sibling `internship-portal` only.
- Confirm against live `src/` — do not invent cases for missing features.
- Never blank `.env.local` or paste OTP secrets into docs.

## Inspect before modifying

`InternSafar-Test-Cases.xlsx`, runners, `qa/tests/*`, `qa/helpers/accounts.js`, `scripts/lib/ipTestAccountsConfig.js`, related `scripts/lib/ipQa*.mjs`, `docs/qa-employer-register-e2e.md`, `.env.example`.
