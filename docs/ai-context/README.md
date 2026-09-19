# InternSafar AI context pack (“cortex”)

This folder is the **local AI project-context pack** for **InternSafar** (npm package `internship-portal`).  
Cursor workspace rules also call it the InternSafar / internship-portal context pack.

It is **not** the application source. It is a map so an AI (or human) can orient quickly, then open the real files.

| Property | Value |
|----------|--------|
| Lives at | `internship-portal/docs/ai-context/` |
| Handoff zip | `internship-portal/docs/internsafar-ai-context.zip` (rebuild after pack edits — see `CONTEXT_UPDATE.md`) |
| Git | **Tracked in git** (folder + zip) — pushed to GitHub with the app repo |
| App to edit | Sibling folder `internship-portal/` (same repo root as this `docs/` tree) |
| Do not edit | `campus-placement-multiuser/internship-portal/` (frozen nested copy) |
| Last pack refresh | 2026-09-19 (agent convention: session-startup Read of PROJECT_INDEX) |
| Last zip rebuild | 2026-09-19 |

## If you only received a zip of this folder

Canonical zip path on this machine: `internship-portal/docs/internsafar-ai-context.zip`.

1. Unzip anywhere.
2. Read **this file**, then `PROJECT_INDEX.md`, then `FOLDER_STRUCTURE.md`.
3. Open only the matching `domains/*.md` for your task.
4. You still need the full **`internship-portal`** app tree (and usually the parent `UIUX Migration` workspace) next to these docs to change code. Paths in this pack are **relative to the app root** `internship-portal/` unless marked as workspace-absolute.

## Read order (every non-trivial task)

```text
README.md  (you are here)
  → PROJECT_INDEX.md          # what the product is + hard rules
  → FOLDER_STRUCTURE.md       # where files live
  → domains/<one domain>.md   # only the active area
  → open live source under src/, db/, qa/, scripts/
  → SKILLS_MAP.md only if the task type needs a skill
```

Do **not** load every domain file or every skill up front.

## File map

| File | Purpose |
|------|---------|
| `PROJECT_INDEX.md` | Product map, stack, domains, hard constraints |
| `FOLDER_STRUCTURE.md` | Important folder/route tree (inspected from live app) |
| `SKILLS_MAP.md` | Which local skill / standing prompt / BRD to open |
| `RELATED_WORKSPACE.md` | Sibling folders outside the app (AWS, Gemini, prompts) |
| `DECISIONS.md` | Stable confirmed decisions only |
| `CONTEXT_UPDATE.md` | When to refresh this pack |
| `domains/*.md` | Auth, DB, roles, UI, workflow, deploy, testing |

## Source-of-truth order

1. Live source / config / migrations under `internship-portal/`
2. Approved repo docs (`AGENTS.md`, `README.md`, handoff txt)
3. Matching skill under `.agents/skills/`
4. This ai-context pack
5. Inference (last; never invent tables, roles, or status enums)

## Hard rules (short)

- Product tables: **`ip_*` only**. Do not alter Placement Hub / `ism_*` schemas.
- Edit **sibling** `internship-portal` only; deploy Vercel from sibling only.
- AWS Path B = **no DB migrate**. Path C = empty RDS + `IP_ALLOW_DB_MIGRATE=1` only.
- Never blank/wipe `.env` / `.env.local`. Do not push unless the user explicitly asks.
- No `middleware.js` — API session/role checks + `PortalShell` client guard.
