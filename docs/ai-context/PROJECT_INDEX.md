# InternSafar — Project Context Index (Level 1)

Compact map for AI agents. **Not** a full README of the product.  
**Inspected from live sibling app:** 2026-09-24.

After this file: open `FOLDER_STRUCTURE.md` to locate paths, then **one** `domains/*.md`, then live source.

All paths below are relative to app root: `internship-portal/` unless marked otherwise.

---

## What is this product?

**InternSafar** (package name `internship-portal`) is a Next.js internship marketplace.

| Role | Portal home | Typical work |
|------|-------------|--------------|
| **candidate** | `/candidate` | Profile, browse/apply, applications, messages, offers, referral, notifications |
| **employer** | `/employer` | Profile/docs, postings, candidate search/workbench, messages, offers, analytics |
| **superadmin** | `/superadmin` | Approvals, documents, postings oversight, promos, viral, ideas |

Public/marketing and auth surfaces: `/` (landing + **email/password** sign-in), `/login`, `/register`, `/register/candidate`, `/register/employer`, `/forgot-password`, `/help`, `/ideas`, `/guidelines`, `/how-it-works`, `/account`, referral short links `/r/[code]`, email unsubscribe `/unsubscribe?token=…` (token only — email not in URL). Google OAuth is used for **registration verify** only, not home login.

SuperAdmin has a **separate** login at `/superadmin/login` (not the public landing).

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
| DB | Postgres via `pg` (`src/lib/db.js`). Migrations: `db/migrations/` (48 SQL files as of this inspect; prefer `*ip*`; latest numbered `044_ip_internship_stipend_range.sql`) |
| Files | AWS S3 (`src/lib/s3.js`), object prefix `internship-portal/…`; download authz helper `src/lib/ipFileAccess.js` |
| Mail | ZeptoMail / SMTP (`src/lib/mail.js`, `zeptomail.js`); outbound footers can append unsubscribe via `src/lib/ipEmailUnsubscribe.js` |
| Help chat LLM | NVIDIA NIM helpers (`src/lib/nvidiaLlm.js`, `/api/ip/help-chat`) |
| Deploy | Vercel from sibling; AWS EC2 via workspace handoff packs |
| QA | Playwright under `qa/` (smoke / regression with journeys / full:release) + Excel workbook `test-cases/InternSafar-Test-Cases.xlsx` |

### Environments ↔ database (confirmed)

| Host | Database |
|------|----------|
| Local (`npm run dev` → `http://localhost:3000`) | Shared Neon / `DATABASE_URL` from `.env.local` |
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
| Testing / regression | `domains/testing.md` | `test-cases/`, `qa/`, `npm run qa:*` |

Full route/API inventory (large): `ISM_ROUTE_INVENTORY.md` — open only when you need exhaustive route lists.

---

## Hard constraints (do not violate)

1. **Sibling only** for product edits; never edit nested mono `campus-placement-multiuser/internship-portal`.
2. **`ip_*` tables only** — no Placement Hub schema changes from IP work.
3. **Path B AWS app update = no DB migrate.** Path C = fresh/empty RDS only with `IP_ALLOW_DB_MIGRATE=1`.
4. **New migrations must not wipe live data** (no DELETE/DROP TABLE/TRUNCATE patterns in new SQL). Gates: `scripts/assert-db-migrate-allowed.js`, `scripts/assert-migration-sql-safe.js`.
5. **Never blank/wipe** `.env` / `.env.local`. Do not push unless the user explicitly asks in that message.
6. **No `middleware.js`** — protect via API session/role checks + `src/components/ip/PortalShell.jsx`.
7. **UI quality** rules live in `AGENTS.md`. `PRODUCT.md` and `DESIGN.md` are **referenced there but missing** in the repo — follow `AGENTS.md` UI block + local UI skills instead of inventing those files unless the user asks to create them.
8. Preserve Playwright IDs, live APIs, and role behaviour unless the user asks to change them.

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
8. Verify (lint/build/tests as appropriate)
9. Update this ai-context pack only if stable project knowledge changed
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
| Stable decisions | `DECISIONS.md` |

---

## Known gaps (facts, not guesses)

| Item | Status |
|------|--------|
| `PRODUCT.md` / `DESIGN.md` | Named in `AGENTS.md`, **not present** in app root |
| `docs/README.md` | Named in `AGENTS.md` documentation layout, **not present** |
| `docs/ai-context/` | Local-only (gitignored). Zip this folder for offline AI briefing; keep it next to a full app checkout to edit code |
| Handoff-WITH-SECRETS workspace folder | May contain secrets — never paste secret values into chat or into these docs |
| ER notes last full sync | `docs/ip-er-diagram-notes.md` synced through migration **039**; files **040** (`ip_help_chat_analytics`) and **041** (email unsubscribe tokens/requests) also exist — re-check ER notes when changing schema |
| Code-review remediation (2026-09-18) | Valid **Critical** + Valid **High** (non-a11y) from GPT triage applied on sibling + Vercel preview; **Medium/Low** and all **Accessibility** still open — see `DECISIONS.md` |
