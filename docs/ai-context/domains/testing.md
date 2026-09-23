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

CI: skip OTP success assertions when codes unset, or use bypass. Core accounts: `qa/helpers/accounts.js`.

Employer register E2E (no inbox): `npm run qa:employer-reg-e2e` and deep smoke `npm run qa:register-approve-post-apply`. Both must assert **real credentials login** at gates (fail before verify; succeed pending+verified; SA login; approved login; candidate login+apply). Do not pass on register-only. Flow doc: `docs/qa-employer-register-e2e.md`.

### 5) `qa:e2e` default scope

| Command | Scope |
|---------|--------|
| `npm run qa:e2e` / `test:e2e` | General Playwright entry — **does not** force google-auth + regression |
| `npm run qa:e2e:regression` or `qa:e2e -- --suite=regression` | `auth` + `google-auth` + `regression` (+ Excel apply on regression npm script) |

### 6) Email unsubscribe manual / scripted checks

| Command / path | Role |
|----------------|------|
| `npm run test:email-unsubscribe` | Unit/scripted unsubscribe helpers (`scripts/test-ip-email-unsubscribe.mjs`) |
| `npm run test:email-unsubscribe:live` | Live smoke (`scripts/smoke-ip-email-unsubscribe-live.mjs`) |
| Helper scripts | `send-unsub-test-to-core-employer.mjs`, `simulate-unsub-click-core-employer.mjs`, `send-core-employer-new-applicant-mail.mjs` |

**External tester with GitHub zip only:** needs working `.env.local` with at least `DATABASE_URL` plus mail (`ZEPTOMAIL_*` or `SMTP_*`) to exercise real send + click + PENDING queue. Google client files are **not** required for unsubscribe-only testing. Local and Vercel share the same Neon DB — coordinate before wiping users.

---

## Runners

| Role | Command | Entry |
|------|---------|-------|
| Playwright e2e | `npm run qa:e2e` | `qa/runners/run-internsafar.mjs` |
| Regression + Excel apply | `npm run qa:e2e:regression` | `scripts/run-regression-and-apply-xlsx.mjs` |
| Checklist QA | `npm run qa:checklist` / `qa:checklist:apply` | `scripts/run-ip-checklist-qa.mjs` |
| Migrate Excel cols | `npm run qa:migrate-xlsx-cols` | `scripts/migrate-internsafar-xlsx-boarders-cols.py` |
| Patch latest TC-IS rows | `npm run qa:patch-latest-cases` | `scripts/patch-internsafar-latest-cases.py` |
| Install Playwright browsers | `npm run playwright:install` | Persistent `%LOCALAPPDATA%/ms-playwright` |

Specs under `qa/tests/`: `auth.spec.js`, `google-auth.spec.js`, `regression.spec.js`, `screens.spec.js`, `mobile-candidate-internships.spec.js`.

Playbook: `qa/docs/internsafar-runner-playbook.md`.

## Prompts pack

`internship-portal/prompts/Testing/` (local; typically gitignored with other prompt packs).

## Skills

`manual-test-case-generator`, `webapp-testing`, `tdd`; Cursor rules `test-plan-generation`, `test-data-generation` when present.

## Constraints

- Sibling `internship-portal` only.
- Confirm against live `src/` — do not invent cases for missing features.
- Never blank `.env.local` or paste OTP secrets into docs.

## Inspect before modifying

`InternSafar-Test-Cases.xlsx`, runners, `qa/tests/*`, related `scripts/lib/ipQa*.mjs`, `docs/qa-employer-register-e2e.md`, `.env.example`.
