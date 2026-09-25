# Stable project decisions (InternSafar)

Only confirmed, durable decisions. Not a chat diary.  
Last pack refresh: 2026-09-25.

| Decision | Domain | Status | Evidence |
|----------|--------|--------|----------|
| Product tables are `ip_*` only; do not alter Placement Hub / `ism_*` | Database | Confirmed | `README.md`, `src/lib/db.js`, route inventory |
| Three roles: candidate, employer, superadmin | Auth / product | Confirmed | `ISM_ROUTE_INVENTORY.md`, `src/lib/ipNav.js` |
| No `middleware.js`; APIs are the security boundary; `PortalShell` is client guard | Auth | Confirmed | `ISM_ROUTE_INVENTORY.md`, absence of `middleware.js` |
| Edit/deploy sibling `internship-portal`; nested mono copy is frozen | Workspace | Confirmed | Dual-folder workspace rule |
| Sibling app has its own `.git`; nested copy remains frozen regardless | Workspace | Confirmed | Live tree 2026-09-15 |
| Path B AWS update never migrates DB; Path C only on empty RDS with allow env | Deployment | Confirmed | `AGENTS.md`, Path B rule |
| New migrations must not wipe live rows | Database | Confirmed | Migration safety scripts + rule |
| Gemini HTML mocks → InternSafar UI (not Placement Hub) unless user says otherwise | UI | Confirmed | `gemini-tsx-handoff` workspace rule |
| Google register = verification; linked Google home sign-in opens portal session | Auth | Confirmed | `domains/testing.md`, auth helpers |
| S3 uploads under `internship-portal/…` prefix | Files | Confirmed | `README.md` |
| Local + Vercel share one Neon DB; production AWS is a separate DB | Database / Deploy | Confirmed | `domains/database.md` |
| Single InternSafar QA workbook SoT = `test-cases/InternSafar-Test-Cases.xlsx`; Boarders xlsx = format only | Testing | Confirmed | `domains/testing.md` |
| Live NIM help-chat completion = manual-only; GET/empty POST/UI smoke = automated | Testing | Confirmed | `domains/testing.md`, `regression.spec.js` |
| Canonical QA OTP env = `IP_QA_2FA_*` + `IP_QA_EMAIL_CHANGE_CODE`; CI skips/bypass when unset | Testing | Confirmed | `.env.example`, QA scripts |
| Bare `qa:e2e` does not force google-auth+regression; use `qa:e2e:regression` / `--suite=regression` | Testing | Confirmed | `qa/runners/run-internsafar.mjs`, `package.json` |
| `PRODUCT.md` / `DESIGN.md` named in `AGENTS.md` but missing — use `AGENTS.md` UI block + skills | UI | Confirmed gap | Live tree 2026-09-15 |
| Email unsubscribe link creates a **PENDING** SuperAdmin request only; does **not** stop mail delivery yet; URL uses `token` only (no email in query) | Mail / SuperAdmin | Confirmed | Migration `041_*`, `ipEmailUnsubscribe.js`, `/unsubscribe`, `mail.js` footers |
| Shared client list paging uses `IpListPager` (+ `ip-list-pager.css`) on candidate/employer list surfaces | UI | Confirmed | `IpListPager.jsx`; internships/offers/notifications/messages |
| v3 code-review prompts omit Accessibility (FE-ACC / a11y) from review + remediation | Process | Confirmed | `prompt-test-extract/…/code-review-prompt_version3.txt`, user 2026-09-18 |
| 2026-09-18 review remediation: Valid **Critical** + Valid **High** (non-a11y) fixed on sibling and deployed to Vercel preview; **Medium/Low** + all a11y remain open | Process / Quality | Confirmed | GPT triage DOCX + sibling working tree + Vercel deploy 2026-09-18 |
| Agents must **Read** `docs/ai-context/PROJECT_INDEX.md` on chat startup (and before IP search/edit); rule text alone is not enough | Process / Agents | Confirmed | `.cursor/rules/internsafar-ai-context-pack.mdc`, `AGENTS.md` ai-context-pack block |
| Profile/registration label = **Country**; list filters label = **Region**. Options live in DB table `ip_ref_countries` (migration `043_*`) and `/api/ip/ref/countries`, with static fallback in `src/lib/ipRegions.js`: India, Pakistan, Bangladesh, Sri Lanka, Nepal, Indonesia, Malaysia, Thailand. Candidate browse filters employer `hq_country`; employer search filters candidate `country` via `region` query. | Candidate / Employer | Confirmed | `ip_ref_countries`, `useIpCountryCatalog`, migration `043_*` |
| Live Employer Register (Domain + Free Email) → `/superadmin/approvals` Only; Form Registrations + Manual Requests UI Retired; Candidates Have No SA Approval Queue; Path Column Uses `registration_source` | SuperAdmin / Auth | Confirmed | Live Register Proof 2026-09-23; `register-employer`, Redirects, `ipNav.js` |
| Final Employer Approval Requires Documents First (At Least One Approved Doc, No Pending Docs); Documents Approve Does Not Alone Unlock Login/Posting | SuperAdmin / Employer | Confirmed | `employers/[id]` Gate 2026-09-23 |
| Employer Guidelines & Ethics: Accept/Reject UI; lock after all Accepted + saved (`ethics_accepted_at`); API rejects revoke; SA `resetEthics` unlock; posting gate requires saved ethics | Employer / SuperAdmin | Confirmed | Profile + `ipEmployerPostingGate` + SA employers PATCH 2026-09-25 |
| Employer profile uses employer-specific Tabs (Company / Contact & Location / About & Visibility / Ethics / Documents); Country→State→City→Phone; logo URL hidden when image set | Employer / UI | Confirmed | `employer/profile/page.js` 2026-09-25 |
| Employer may sign in after email verification while still pending Final Approval (to upload docs); Postings nav/API stay gated until approved | Auth / Employer | Confirmed | `auth.js` + employer layout 2026-09-23 |
| Employer email-verify QA exposure via `IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE` (token + mail metadata in register JSON); hard-off when `VERCEL_ENV=production`; employers use form password (no temp-password mail) | Testing / Auth | Confirmed | `ipQaEmployerRegister.js`, `qa-employer-reg-verify-approve-login.mjs`, `docs/qa-employer-register-e2e.md` |
| Employer email verify resend (login + post-register); cooldown ~45s; candidates have no verify-before-login | Auth | Confirmed | `employer-email-verify/resend`, `IpSignInLanding`, `EmployerRegisterClient` |
| Form candidate path + manualRequest employer queue retired (410); drop `ip_employer_requests` + `form_approval_status` via bootstrap | Auth / SuperAdmin | Confirmed | `ensureIpRetireDeadQueuesSchema.js` |
| QA/seed accounts must use realistic varied personas; do not pile scripted traffic onto core showcase inboxes | Testing | Confirmed | `ipQaRealisticPersonas.mjs`, workspace rule `qa-test-account-variety` |
| AWS email-verify: ADD schema + one-time fill `email_verified_at=created_at` for existing employers; **no** `email_verify_required=false` grandfather (temp runner deleted after run) | Auth / Deploy | Confirmed | Applied AWS RDS 2026-09-23; `ensureIpEmployerEmailVerifySchema` schema-only |

## Do Not Add Here

- One-off bug fixes, CSS tweaks, temporary experiments
- Speculative roadmap items
- Secrets, PEM contents, or credential values
