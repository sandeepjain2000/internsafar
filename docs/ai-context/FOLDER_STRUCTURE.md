# InternSafar — folder structure map

**App root:** `internship-portal/`  
**Generated from live tree:** 2026-09-18  
**Omits:** `node_modules/`, `.next/`, `.git/`, `test-results/`, scratch `tmp-*`

Use this to **locate** files. Then open the real path.  
Deep deploy layout also exists at `APP-FOLDER-STRUCTURE.txt` (handoff-oriented). Prefer **this map** for day-to-day AI work.

Paths are relative to `internship-portal/` unless under “Related workspace folders”.

---

## Top level

```text
internship-portal/
├── src/                         # App code (pages, APIs, components, lib)
├── db/migrations/               # SQL migrations (ip_* preferred; some legacy ism_* remain)
├── docs/                        # ER notes, validation score, ai-context (local)
│   ├── ai-context/              # THIS pack (gitignored)
│   ├── ip-er-diagram-notes.md
│   ├── ip-er-diagram.puml
│   └── VALIDATION_SCORE.md
├── qa/                          # Playwright helpers, runners, tests
├── scripts/                     # DB/QA/AWS handoff builders (see SCRIPTS-README.md)
├── public/                      # Static assets, seed samples
├── prompts/                     # Prompt library (Testing = cases/regression)
│   ├── Development/
│   ├── Mobile/
│   ├── Projects/
│   ├── Testing/
│   ├── UI Design/
│   └── Websites/
├── test-cases/                  # InternSafar-Test-Cases.xlsx (QA SoT)
├── reference-wireframes/        # Historical HTML prototype
├── reference-screenshots/
├── .agents/skills/              # skills.sh skills (load on demand)
├── .cursor/rules/               # Local Cursor rules (often gitignored)
├── AGENTS.md                    # Always-on agent instructions
├── README.md
├── InternSafar_Business_Requirements.txt
├── ISM_ROUTE_INVENTORY.md       # Full route/API inventory (large — on demand)
├── ISM_USER_GUIDE.md
├── WORKBENCH_FEATURE_GUIDE.md
├── WORKBENCH_IMPLEMENTATION_REPORT.md
├── APP-FOLDER-STRUCTURE.txt
├── IP_FIX_CHECKLIST.md
├── package.json
├── next.config.mjs
├── playwright.config.js
├── components.json              # shadcn
├── vercel.json
├── .env.example                 # never wipe real .env / .env.local
└── …
```

---

## `src/` — application code

```text
src/
├── app/
│   ├── layout.js, page.js, globals.css, error.js, global-error.js
│   ├── login/
│   ├── register/
│   │   ├── candidate/
│   │   └── employer/
│   ├── forgot-password/
│   ├── account/
│   ├── app/                     # Post-auth redirect helper
│   ├── candidate/
│   │   ├── applications/
│   │   ├── internships/         # list + [id]
│   │   ├── messages/            # list + [id]
│   │   ├── notifications/
│   │   ├── offers/
│   │   ├── profile/
│   │   └── referral/
│   ├── employer/
│   │   ├── analytics/
│   │   ├── candidates/          # list + [id]
│   │   ├── internships/         # list + new + [id] + [id]/edit
│   │   ├── messages/            # list + [id]
│   │   ├── notifications/
│   │   ├── offers/
│   │   ├── profile/
│   │   ├── referral/
│   │   ├── rejection-templates/
│   │   └── viral/
│   ├── superadmin/
│   │   ├── approvals/
│   │   ├── documents/
│   │   ├── feature-ideas/
│   │   ├── form-registrations/
│   │   ├── login/
│   │   ├── login-report/
│   │   ├── messages/
│   │   ├── postings/
│   │   ├── promotions/
│   │   ├── requests/
│   │   └── viral/
│   ├── ideas/, help/, guidelines/, how-it-works/
│   ├── unsubscribe/             # Email unsubscribe confirm (token query)
│   ├── r/[code]/                # Referral short links
│   └── api/
│       ├── auth/[...nextauth]/, auth/captcha/
│       └── ip/                  # All InternSafar JSON APIs (98 route.js files)
├── components/
│   ├── ip/                      # Product UI + scoped *-gemini.css
│   ├── ui/                      # shadcn primitives
│   ├── auth/                    # Shared auth widgets
│   ├── Providers.jsx, ThemeProvider.js, ToastProvider.js, …
│   ├── DataTableToolbar.jsx, PageLoading.jsx, ThemeToggleButton.jsx
├── lib/                         # Auth, DB, mail, S3, domain helpers, ensureIp*.js
│   └── ipHelpChat/              # Help chatbot knowledge/runtime
├── hooks/
├── config/menu.js
└── styles/shadcn.css
```

### Page routes that exist (`page.js` confirmed)

| Area | Routes |
|------|--------|
| Public / auth | `/`, `/login`, `/register`, `/register/candidate`, `/register/employer`, `/forgot-password`, `/account`, `/app`, `/r/[code]`, `/unsubscribe` |
| Content | `/help`, `/ideas`, `/guidelines`, `/how-it-works` |
| Candidate | `/candidate`, `/candidate/profile`, `/candidate/internships`, `/candidate/internships/[id]`, `/candidate/applications`, `/candidate/messages`, `/candidate/messages/[id]`, `/candidate/offers`, `/candidate/notifications`, `/candidate/referral` |
| Employer | `/employer`, `/employer/profile`, `/employer/internships`, `/employer/internships/new`, `/employer/internships/[id]`, `/employer/internships/[id]/edit`, `/employer/candidates`, `/employer/candidates/[id]`, `/employer/messages`, `/employer/messages/[id]`, `/employer/offers`, `/employer/notifications`, `/employer/analytics`, `/employer/rejection-templates`, `/employer/referral`, `/employer/viral` |
| SuperAdmin | `/superadmin`, `/superadmin/login`, `/superadmin/approvals`, `/superadmin/requests`, `/superadmin/documents`, `/superadmin/postings`, `/superadmin/promotions`, `/superadmin/viral`, `/superadmin/login-report`, `/superadmin/messages`, `/superadmin/form-registrations`, `/superadmin/feature-ideas` |

Nav labels/order: `src/lib/ipNav.js`.

### `src/app/api/ip/` top-level domains (confirmed)

`account`, `auth`, `bootstrap`, `candidate`, `completions`, `cron`, `employer`, `endorsements`, `files`, `help-chat`, `idea-categories`, `ideas`, `list-presets`, `messages`, `nav-badges`, `notifications`, `offers`, `ops`, `points`, `profile-reminder`, `promotions`, `qa`, `ratings`, `ref`, `referral`, `superadmin`, `table-filter-prefs`, `unsubscribe`, `viral`

SuperAdmin API sub-area of note: `superadmin/unsubscribe-requests` (PENDING queue for email unsubscribe clicks).

Full path list of every `route.js`: use a directory listing or `ISM_ROUTE_INVENTORY.md`. Do not invent endpoints.

### Important `src/components/ip/` pieces

| Kind | Examples |
|------|----------|
| Shell / auth chrome | `PortalShell.jsx`, `AuthShell.jsx`, `IpSignInLanding.jsx`, `IpGeminiBrand.jsx` |
| Messaging | `MessagesInbox.jsx`, `MessagesSplitPane.jsx`, `MessageThreadView.jsx`, `EmployerMessagesSplit.jsx` |
| Tables / filters | `IpTableFiltersShell.jsx`, `IpTablePagination.jsx`, `IpListPager.jsx` (+ `ip-list-pager.css`), `ListPresetsBar.jsx`, `ViewModeToggle.jsx` |
| Help | `HelpChatbot.jsx`, `ip-help-chatbot.css` |
| Gemini scoped CSS | `ip-*-gemini.css`, `ip-gemini-dark-surface.css`, `ip-mobile.css` |

### Important `src/lib/` pieces

| Kind | Files |
|------|--------|
| Core | `auth.js`, `apiAuth.js`, `db.js`, `mail.js`, `s3.js`, `zeptomail.js`, `ipNav.js`, `roleHome.js` |
| Schema ensure | `ensureIp*.js` (many — bootstrap/schema helpers) |
| Domain helpers | `ipCandidate*.js`, `ipEmployer*.js`, `ipMessage*.js`, `ipOffer*.js`, `ipNotify.js`, workbench/export/points helpers |
| Mail / unsubscribe | `ipEmailUnsubscribe.js`, `ipEmailUnsubscribeFormat.js` (wired from `mail.js`) |
| Files authz | `ipFileAccess.js` (S3/object download checks used by `/api/ip/files`) |
| Auth extras | `ipGoogleAuth.js`, `ipTwoFactor.js`, `ipAuthSessions.js`, `ipEstablishPortalSession.js` |
| Ops / LLM | `ipOpsAlert.js`, `nvidiaLlm.js`, `ipHelpChat/` |

---

## `db/`

```text
db/
└── migrations/     # Numbered SQL; 47 files as of 2026-09-18
```

Latest numbered `ip_*` files include through `041_ip_email_unsubscribe_requests.sql` (also `040_ip_help_chat_analytics.sql`).  
Tables added in 041: `ip_email_unsubscribe_tokens`, `ip_email_unsubscribe_requests` (status `PENDING` \| `PROCESSED`; click does **not** stop mail by itself).  
Legacy `001_ism_schema.sql`, `002_ism_portal_features.sql`, and a few non-`ip_`-prefixed files remain — do not treat them as the product schema to extend.

Do not invent tables. Read migrations and/or `docs/ip-er-diagram-notes.md` first.  
Migrate only with documented Path B/C gates (`domains/database.md`, `domains/deployment.md`).

---

## `qa/` / `scripts/` / `test-cases/` / `prompts/`

```text
qa/
├── docs/                 # Runner playbooks (e.g. internsafar-runner-playbook.md)
├── helpers/              # accounts.js and shared QA helpers
├── runners/              # run-internsafar.mjs
├── tests/                # auth, google-auth, regression, screens, mobile-candidate-internships
└── routes-by-role.js

scripts/
├── aws-handoff-docs/     # PATH-B / AWS-DEPLOY copies used by handoff build
├── lib/                  # Shared script helpers (xlsx cols, playwright browsers, …)
├── manual/               # One-off manual QA scripts
├── build-aws-handoff.ps1
├── db_exec_sql_file.js
├── assert-db-migrate-allowed.js
├── assert-db-migrate-target.js
├── assert-migration-sql-safe.js
├── deploy-fresh-aws-db.mjs
├── run-ip-checklist-qa.mjs
├── run-regression-and-apply-xlsx.mjs
└── …                     # Full catalogue: scripts/SCRIPTS-README.md

test-cases/
├── InternSafar-Test-Cases.xlsx   # Single InternSafar QA workbook SoT
├── qa-results.json
└── manual/

prompts/
└── Testing/
    ├── boarders_latest_update_test_checklist.xlsx   # FORMAT reference only
    └── … QA / regression prompt files
```

Key npm scripts (from `package.json`): `dev`, `build`, `db:migrate:*`, `deploy:fresh-aws-db`, `db:check-migration-safety`, `qa:e2e`, `qa:e2e:regression`, `qa:checklist`, `qa:checklist:apply`, `test:email-unsubscribe`, `test:email-unsubscribe:live`.

---

## Related workspace folders (beside the app)

Full roles: `RELATED_WORKSPACE.md`.

```text
UIUX Migration/
├── internship-portal/                         # EDIT + Vercel HERE
├── campus-placement-multiuser/
│   └── internship-portal/                     # FROZEN nested copy — do not edit
├── InternSafar_Business_Requirements.txt      # Workspace-root BRD
├── Development prompts for cursor to use/     # Plan / build / verify standing prompts
├── internship-portal-aws-handoff/
├── internship-portal-aws-handoff-WITH-SECRETS/
├── latets projet cdoe for aws deploy/
├── aws deploy/
├── Aws deployment documents/
├── gemini-tsx-handoff/                        # mocks/, assets/
├── mobile csreens internsafar/
├── mobile-prompt-test/
├── qa-samples-for-internsafar/
├── _local-backups-internship-portal/
├── task-docs/
├── prompts/                                       # Prompt DOCX library (Google-linked catalog)
├── new prompt files/
├── prompt-test-extract/                           # Unpacked v3 review prompts + extract app + reports
└── Read me and txt copies that are renamed/
```

---

## How to use this map

```text
Find area in this file
  → open matching docs/ai-context/domains/<domain>.md
  → open the real source path under src/ (or db/, scripts/, qa/)
  → open ISM_ROUTE_INVENTORY.md only when you need the full exhaustive inventory
```
