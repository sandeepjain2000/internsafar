# Skills map (task → discover → load one)

Do **not** load every skill. Prefer an existing local skill under `.agents/skills/<name>/SKILL.md`.  
`AGENTS.md` also describes skills.sh auto-install for missing skills.

Paths below are relative to `internship-portal/` unless marked as workspace paths.

## Product / InternSafar-relevant

| Task type | Load first | Notes |
|-----------|------------|-------|
| UI restyle, pages, components, Gemini mock apply | `shadcn`, `frontend-design`, `tailwind-design-system` | Also `web-design-guidelines` for a11y review |
| UI critique / polish | `impeccable`, `ui-ux-pro-max`, `ckm-ui-styling` | Optional extras |
| Bug diagnosis | `diagnose` and/or `systematic-debugging` | Then inspect source |
| Architecture review | `improve-codebase-architecture` | Do not rewrite product unless asked |
| Playwright / webapp tests | `webapp-testing`, `tdd` | App suite under `qa/` |
| Manual test case / plan gen | `manual-test-case-generator` (+ Cursor test-plan rules if present) | Also `domains/testing.md` + `prompts/Testing/` |
| Regression / update checklist | `domains/testing.md` | Boarders xlsx = format reference only |
| Frontend / backend QA prompt packs | `prompts/Testing/` PDFs | From prompts library |
| DOCX / XLSX / PDF artifacts | `docx`, `xlsx`, `pdf` | Docs only |
| AWS / Path B–C / migrate | **No separate skill** — use Cursor rules + `domains/deployment.md` + handoff txt | Always-on: Path B + no-wipe migration rules |

## Standing human prompts (workspace, not skills)

Folder: `UIUX Migration/Development prompts for cursor to use/`

| Mode | File (go by **content**, filenames are swapped) |
|------|--------------------------------------------------|
| Phased plan | `Implementation_Prompt_final (1).txt` |
| Build | `Planning_Prompt_final (2).txt` |
| Verify | `Verification_Prompt_final (1).txt` |

## Product requirements (BRD)

| Path | Use |
|------|-----|
| `UIUX Migration/InternSafar_Business_Requirements.txt` | Workspace-root BRD |
| `internship-portal/InternSafar_Business_Requirements.txt` | In-app copy |

Load only for product/requirements questions — not for ordinary UI/CSS fixes.

## Testing / regression prompt library

| Path | Use |
|------|-----|
| `internship-portal/prompts/Testing/` | Test-case creation, QA prompts, regression checklists |
| `…/boarders_latest_update_test_checklist.xlsx` | Format reference only |
| Domain note | `domains/testing.md` |

## Marketing / SEO / CRO skills

Many skills under `.agents/skills/` are marketing/SEO/CRO. **Ignore unless the task is marketing.** Do not load them for ordinary InternSafar app work.

## Discovery steps

1. Match task type to the table above.
2. If a row matches, **read that skill’s `SKILL.md`**.
3. If none match, proceed with domain context + source — do not install random skills.
4. For UI, if mandatory UI skills are missing locally, follow `AGENTS.md` install guidance.
