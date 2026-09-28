<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:skills-auto-fetch -->
# Skills Auto-Fetch Rules

Registry: [https://www.skills.sh](https://www.skills.sh)

Before starting any non-trivial task, check whether a relevant skill exists in `.agents/skills/`. If no matching skill is found locally, proactively install it from skills.sh using:

```bash
npx -y skills add <owner/repo> --skill <skill-name> -y
```

## Mandatory for UI / shadcn / design work (do not freestyle without these)

Before any UI migration, restyle, component, page layout, or design-system work in this app, **read and follow** these local `SKILL.md` files (installed from skills.sh):

| Skill | Path | Use for |
|-------|------|---------|
| **shadcn** | `.agents/skills/shadcn/SKILL.md` | Components, registries, forms, overlays, composition |
| **frontend-design** | `.agents/skills/frontend-design/SKILL.md` | Distinctive UI direction, typography, layout quality |
| **web-design-guidelines** | `.agents/skills/web-design-guidelines/SKILL.md` | Accessibility / Web Interface Guidelines review |
| **tailwind-design-system** | `.agents/skills/tailwind-design-system/SKILL.md` | Tokens, Tailwind patterns, scalable styling |

Also useful when already present: `impeccable`, `ui-ux-pro-max`, `ckm-ui-styling`.

**Rule:** Do not invent ad-hoc UI kits or ignore these skills when they apply. Prefer them over freestyle design advice.

## When to auto-install skills

| Task type | Skill(s) to install if missing |
|---|---|
| UI/UX design, redesign, restyle, or critique | `shadcn`, `frontend-design`, `web-design-guidelines`, `tailwind-design-system` (plus `impeccable` / `ui-ux-pro-max` if helpful) |
| Frontend component or page building | `shadcn`, `frontend-design`, `tailwind-design-system` |
| Writing or improving copy | `coreyhaines31/marketingskills` |
| Diagnosing bugs or regressions | `diagnose` (mattpocock/skills) |
| Architecture review or refactoring | `improve-codebase-architecture` |
| Test generation (Playwright / TDD) | `tdd`, `webapp-testing` |
| SEO, schema markup, or AI search | marketing SEO skills already under `.agents/skills/` |
| PDF, DOCX, XLSX generation | `pdf`, `docx`, `xlsx` |
| Generating or editing images | `image` |
| Slide / presentation creation | `pptx`, `ckm-slides` |

## Rules
1. Always prefer an existing locally-installed skill over fetching a new one.
2. If in doubt, install from [skills.sh](https://www.skills.sh) — skills are lightweight Markdown files.
3. After installing, **read** the skill’s `SKILL.md` before proceeding.
4. Do NOT ask the user for permission before installing a skill — just do it.
<!-- END:skills-auto-fetch -->

<!-- BEGIN:ai-context-pack -->
# InternSafar AI context pack (load on startup)

**InternSafar** (npm package `internship-portal`) is a Next.js internship marketplace with three roles:
candidate (`/candidate`), employer (`/employer`), superadmin (`/superadmin`). JavaScript (not TypeScript),
Postgres via `pg` (`ip_*` tables only), NextAuth, Tailwind 4 + shadcn, S3, Vercel preview + AWS EC2 production.

This file is the always-loaded entry point. The detailed project map lives in **`docs/ai-context/`** and is
loaded on demand — do not paste pack content into this file.

## Session startup (every chat, before any edit or search)

1. Read `docs/ai-context/PROJECT_INDEX.md` (product, stack, hard constraints, domain map).
2. Read `docs/ai-context/FOLDER_STRUCTURE.md` to locate files/routes.
3. Read **only** the matching `docs/ai-context/domains/*.md` for the task.
4. Open live source. Live source beats the pack; if they disagree, fix the stale side.

Do not orient from memory or broad greps first. Sibling app only — never edit nested
`campus-placement-multiuser/internship-portal`. Cursor mirror of this block:
workspace rule `.cursor/rules/internsafar-ai-context-pack.mdc` (`alwaysApply: true`).

## Keep the AI context pack current (mandatory)

The pack is tracked in git and pushed to GitHub with the app. It must describe the **current** product,
so it is updated **in the same task** as the code — not later, not "when someone remembers".

**Update the matching pack file whenever a change adds, removes, or changes:**

- A feature or role behaviour (candidate / employer / superadmin flows, approvals, points, offers, messages)
- A page route or `src/app/api/ip/**` endpoint (path, auth/role check, request/response contract)
- DB schema: new migration, table, column, status value, or apply-order change (`scripts/MIGRATION_MANIFEST.txt`)
- Auth / session / registration / verification / login rules
- Env var **names** (never values), npm scripts, QA commands, deploy Path B/C steps
- A stable product decision (→ `DECISIONS.md`)

**Skip the update** for pure CSS/copy tweaks and bug fixes that do not change behaviour or contracts.

**How:** follow `docs/ai-context/CONTEXT_UPDATE.md` — edit only the affected file(s), write concrete paths
(no guesses), bump the inspect/refresh dates, then rebuild `docs/internsafar-ai-context.zip`.

**Before any `git push` or Vercel deploy** (only ever when the user explicitly asks):

1. Review the diff being shipped against the list above.
2. If any item applies and the pack was not updated yet, update it + rebuild the zip first.
3. Ship pack + zip changes in the **same commit / push** as the code they describe.

**Always report** at the end of a feature task one line: `AI context: updated <files>` or
`AI context: no update needed (<reason>)`.
<!-- END:ai-context-pack -->

<!-- BEGIN:post-change-validation -->
# Post-change validation (every code change, including small ones)

Do not report a task complete just because the code compiles.

1. Re-read the changed code for bugs, regressions, and unintended side effects.
2. Check callers and consumers of anything you touched (API contracts, shared components, libs, other roles).
3. Run `npm run lint` (at least on changed files). Run `npm run build` before reporting a feature complete
   and always before a push/deploy. New migration SQL → `npm run db:check-migration-safety`.
4. Run relevant QA when the area has it (see `docs/ai-context/domains/testing.md` for `npm run qa:*`).
5. Fix errors caused by the change, then re-validate. Do not suppress or ignore errors.
6. UI changes: check desktop and mobile layout and the affected user flow.
   API/DB changes: check input validation, error handling, auth/role checks, existing rows, and existing consumers.
7. If something could not be run, say so. Report separately: passed, failures caused by this change,
   pre-existing failures, and checks that could not run.
<!-- END:post-change-validation -->

<!-- BEGIN:aws-db-script-routing -->
# AWS / RDS database scripts (Cursor — read before running any migrate)

**Why a gate exists:** Cursor once ran a DB migrate during Path B (app-only update).
Path B must never touch RDS. Casual `npm run …migrate…` is refused in code until you
explicitly allow writes (`IP_ALLOW_DB_MIGRATE=1` or a confirm CLI flag).

**Live data rule (mandatory):** Going forward, migrations must keep existing data intact.
They **cannot** be delete-and-insert or truncate-and-insert refresh/replace workflows.
Prefer additive schema (`IF NOT EXISTS` / `ADD COLUMN`) and in-place / idempotent data updates.
`IP_ALLOW_DB_MIGRATE=1` allows the gated migrate flow — it is **not** permission to wipe live rows.

**Destructive SQL gate (code):** `scripts/assert-migration-sql-safe.js` refuses new migration
files that contain `DELETE FROM`, `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, etc.
Wired into `db_exec_sql_file.js`. Scan all files: `npm run db:check-migration-safety`.
A fixed legacy allowlist covers old files that already shipped; do not extend it casually.
Emergency only: `IP_ALLOW_DESTRUCTIVE_SQL=1` / `--i-confirm-destructive-sql`.

| Situation | Command | Notes |
|-----------|---------|--------|
| **Path B — app code update only** | **Do not run any DB migrate/seed** | Swap app + build + PM2 only. Do **not** set `IP_ALLOW_DB_MIGRATE`. |
| **Existing / live RDS — schema change** | Only when explicitly requested; data-preserving SQL only | No `TRUNCATE`+`INSERT`, no delete-all+reinsert to refresh data. Inspect SQL before apply. New files blocked by destructive SQL gate. |
| **Path C — fresh / empty AWS RDS** | `IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db` | **Empty RDS only.** Never use Path C to wipe a database that already has real users. |
| SQL only when demo users **already exist** | `IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only` | Not automatically “safe for live prod” — review each file; no wipe patterns. |

Hard rules for agents:
1. App update (Path B) → **no** database migration scripts and **no** `IP_ALLOW_DB_MIGRATE`.
2. Fresh/empty RDS only → Path C command above (env prefix required). Do **not** Path C on live prod.
3. Never design or run migrations that clear tables then reinsert as a “migration” strategy.
4. Code gate: `scripts/assert-db-migrate-allowed.js` → `=== BLOCKED ===` + exit 1 if not allowed.
5. Destructive SQL gate: `scripts/assert-migration-sql-safe.js` → `=== BLOCKED: destructive migration SQL refused ===` for new wipe SQL.
6. Success requires `=== OK ===` banners and exit code **0**. `=== FAIL ===` / `=== BLOCKED ===` = stop.
7. Partial scripts (`db:migrate:candidate-academics`, etc.) also go through `db_exec_sql_file.js` and need the same allow.
8. Full write-up: handoff `PATH-B-NO-DB-MIGRATE.txt`. Cursor rule: `.cursor/rules/db-migration-no-wipe.mdc`.
<!-- END:aws-db-script-routing -->

<!-- BEGIN:ui-quality-standard -->
# UI Quality Standard: v0-Level by Default

ALL frontend work in this project MUST meet production-grade, v0-level design quality. This is non-negotiable and applies to every page, component, and UI edit — not just when the user explicitly asks.

## Mandatory design principles (apply always)

1. **No glassmorphic hero sections** on internal admin pages. Replace with clean editorial headers.
2. **No hero-metric grids** (big number + small label repeated). Use inline stat bars or compact summaries.
3. **No identical card grids**. Use table rows for list data; cards only when content genuinely varies.
4. **No side-stripe borders** (`border-left` > 1px as accent). Use background tints or full borders.
5. **No gradient text** (`background-clip: text`). Use solid colors with weight/size emphasis.
6. **Status must be visually obvious** — color + icon, never color alone.
7. **Typography hierarchy** — minimum 1.25× scale ratio between heading levels. Never flat scales.
8. **Spacing rhythm** — vary padding for visual rhythm. Identical padding everywhere = monotony.
9. **Motion** — ease-out curves only. Never bounce, elastic, or layout-property animations.
10. **Every word earns its place** — no restated headings, no filler copy.

## Context files
- `PRODUCT.md` — product purpose, users, tone, anti-references
- `DESIGN.md` — color system, typography, component patterns, layout rules

Both are **not created yet**. Until the user asks for them, follow this block, the UI skills above, and
`docs/ai-context/domains/ui-ux.md` — do not invent these files.
<!-- END:ui-quality-standard -->

## Documentation layout

| Path | Contents |
|------|----------|
| [`docs/ai-context/`](docs/ai-context/) | AI context pack — start at `PROJECT_INDEX.md` (keep current, see above) |
| [`docs/internsafar-ai-context.zip`](docs/internsafar-ai-context.zip) | Zip of the pack for handing to another AI (rebuild after pack edits) |
| [`InternSafar_Business_Requirements.txt`](InternSafar_Business_Requirements.txt) | BRD |
| [`qa/docs/`](qa/docs/) | Guided runner & manual QA playbooks ([InternSafar runner playbook](qa/docs/internsafar-runner-playbook.md)) |
| [`qa/runners/`](qa/runners/) | Runner scripts — use `run-internsafar.mjs` (not markdown) |
