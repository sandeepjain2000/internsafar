# Related workspace folders (InternSafar context pack)

These folders sit beside the sibling app under the parent workspace `UIUX Migration/`.

**Source of truth for running code:** `internship-portal/` only.  
**Folder tree inside the app:** `FOLDER_STRUCTURE.md`.  
Open the folders below only when the task needs them.

| Folder | Role | When to open |
|--------|------|----------------|
| `internship-portal` | Live edit + Vercel deploy tree | Always for product work |
| `internship-portal-aws-handoff` | AWS deploy pack (prefer no secrets) | AWS Path B/C, EC2, migrate gates |
| `internship-portal-aws-handoff-WITH-SECRETS` | Handoff that may contain secrets | Ops only — never echo secrets into chat/docs |
| `latets projet cdoe for aws deploy` | Extra/older AWS handoff copy + zip | Compare/history if primary handoff unclear |
| `aws deploy` | Guides, tarballs, PEM, problem notes; **AWS schema/backfill push plan** `AWS-PUSH-PLAN-SCHEMA-BACKFILL-2026-09-26.md` | First-time setup / redeploy / AWS blank-fill planning |
| `Aws deployment documents` | Formal runbook / setup / update DOCX | Human runbooks — summarize, don’t dump |
| `gemini-tsx-handoff` | Gemini HTML mocks + assets/logo | UI redesign from mocks |
| `mobile csreens internsafar` | Mobile HTML handoff package | Mobile UI redesign |
| `mobile-prompt-test` | Mobile prompt experiments | Mobile prompt/compare work |
| `qa-samples-for-internsafar` | Sample QA / nested IP / Playwright bits | Sampling only — not the primary app |
| `_local-backups-internship-portal` | Dated page/UI backups | Restore/compare old UI only |
| `task-docs` | InternSafar change/UX notes | Feature placement / showcase notes |
| `prompts` | Prompt DOCX library (workspace; Google Drive catalog via Master Document Links) | Finding / editing Cursor prompts |
| `new prompt files` | Design-system / handoff prompt drafts | New prompt authoring |
| `prompt-test-extract` | Unpacked `v3_prompts` + `code-review-final` + no-secrets IP zip extract + review outputs | Testing / iterating code-review prompts; **not** the live edit tree |
| `Development prompts for cursor to use` | Plan / build / verify standing prompts | Plan / build / verify modes |
| `Read me and txt copies that are renamed` | IP requirements + migration prompt copies | Requirements / migration script prompts |

## Workspace root files

| Path (under `UIUX Migration/`) | Role |
|--------------------------------|------|
| `InternSafar_Business_Requirements.txt` | Business requirements (BRD) |
| `Development prompts for cursor to use/` | Standing Cursor operating prompts |
| `Internship-Portal-Code-Review-Triage-FINAL.docx` | GPT triage of v3 HTML/JSON review (Critical/High/Med/Low + Valid flags) |
| `prompt-test-extract/internship-portal/reviews/internship-portal-2026-09-18-v3-report.{html,json}` | Evidence report from v3 prompt run on the extract tree |

Also mirrored in-app: `internship-portal/InternSafar_Business_Requirements.txt`. If copies differ, note the difference; prefer the one the user points at.

### Code-review prompt testing (2026-09-18)

| Path | Role |
|------|------|
| `prompt-test-extract/v3_prompts/` | Guardrail / step prompts (session → scope → test+lint → extract → audit → report) |
| `prompt-test-extract/code-review-final/` | Build-system prompt (`code-review-prompt_version3.txt`) for FE/BE/API layered report structure |
| `prompt-test-extract/internship-portal/` | No-secrets extract used as review target (map `src/` UI as frontend; `src/app/api` + `server/lib` as backend/API; root `package.json` for lint/test) |
| Live sibling `internship-portal/` | Where Critical/High remediations were applied and Vercel-deployed |

**Do not edit product code in `prompt-test-extract/internship-portal` for shipping.** Ship from the sibling only.

## Testing prompts library (in-app)

| Path | Role |
|------|------|
| `internship-portal/prompts/` | Full prompts library (Development, Mobile, Projects, Testing, UI Design, Websites) |
| `internship-portal/prompts/Testing/` | Test creation, frontend/backend QA prompts, regression checklists |
| `…/prompts/Testing/boarders_latest_update_test_checklist.xlsx` | **Format reference only** for regression checklists |

Domain guide: `domains/testing.md`.

## Explicitly out of product-edit scope

| Path | Rule |
|------|------|
| `campus-placement-multiuser/internship-portal` | Frozen nested copy — do not edit or deploy from here |
| `campus-placement-multiuser/src/…` | Placement Hub — not InternSafar unless the user says otherwise |

## Deep reference inside the app repo (on demand)

| Doc | Use |
|-----|-----|
| `ISM_ROUTE_INVENTORY.md` | Full route/API inventory |
| `ISM_USER_GUIDE.md` | Role behaviour |
| `InternSafar_Business_Requirements.txt` | In-app BRD copy |
| `WORKBENCH_FEATURE_GUIDE.md` | Employer workbench |
| `scripts/SCRIPTS-README.md` | Scripts catalogue |
| Handoff `AWS-DEPLOY.md`, `PATH-B-NO-DB-MIGRATE.txt` | AWS procedures |
