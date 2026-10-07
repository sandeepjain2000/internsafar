# Context update policy

The pack is tracked in git (pushed to GitHub with the app) and excluded from Vercel uploads via `.vercelignore`.
The always-loaded entry point `AGENTS.md` (app root) makes updating it **mandatory in the same task** as the code change.

## Update `docs/ai-context/**` when a change adds, removes, or changes

- A feature or role behaviour (candidate / employer / superadmin flows, approvals, points, offers, messages)
- A page route or `src/app/api/ip/**` endpoint (path, auth/role check, request/response contract)
- DB schema: migration, table, column, status value, apply order (`scripts/MIGRATION_MANIFEST.txt`)
- Auth / session / registration / verification / login rules
- Env var **names** (never values), npm scripts, QA commands
- Deploy Path B/C rules or AWS schema-gap status
- Stable product decisions (→ `DECISIONS.md`)
- Major architecture, domain boundaries, project-wide agent conventions
- Folder / route map when new areas or role pages land
- Related-folder map if workspace folders move/rename

## Do not update for

- Pure CSS / copy tweaks
- Bug fixes that do not change behaviour or contracts
- Temporary debugging
- Speculative ideas

## Before any `git push` or Vercel deploy (user must have asked for it)

1. Review the diff being shipped against the “update when” list above.
2. If anything applies and the pack is not yet updated: update the affected file(s), bump dates, rebuild the zip.
3. Ship pack + zip in the **same commit / push** as the code they describe.
4. Report `AI context: updated <files>` or `AI context: no update needed (<reason>)`.

## How to update

1. Change only the affected file (`PROJECT_INDEX.md`, `FOLDER_STRUCTURE.md`, one domain doc, or `DECISIONS.md`).
2. Prefer path references over pasted code.
3. Write concrete facts (paths, route names, script names). Do not leave “…” placeholders for important trees.
4. Mark uncertain items as **needs project-owner confirmation** — never promote guesses to facts.
5. If context contradicts current source: investigate, report, then fix the stale side.
6. When refreshing after a large app change: re-scan `src/app`, `src/app/api/ip`, `db/migrations`, `package.json`, and bump the inspect date in `PROJECT_INDEX.md` / `FOLDER_STRUCTURE.md`.

## Zip handoff (canonical)

| Artifact | Path |
|----------|------|
| Live pack | `internship-portal/docs/ai-context/` |
| Zip (must match pack) | `internship-portal/docs/internsafar-ai-context.zip` |

After any change to files under `docs/ai-context/`, **rebuild the zip** in the same session:

```powershell
$src = "C:\Users\place\Work\UIUX Migration\internship-portal\docs\ai-context"
$dest = "C:\Users\place\Work\UIUX Migration\internship-portal\docs\internsafar-ai-context.zip"
if (Test-Path $dest) { Remove-Item $dest -Force }
Compress-Archive -Path $src -DestinationPath $dest -CompressionLevel Optimal
```

When giving the zip to another AI:

1. Ship `internsafar-ai-context.zip` (contents = this folder as-is).
2. Tell the recipient: start at `README.md`, then `PROJECT_INDEX.md`, then `FOLDER_STRUCTURE.md`.
3. Remind them the app source is **not** inside the zip — they need sibling `internship-portal/` to edit code.

Last zip rebuild: **2026-10-07**.

## Skills

Update a skill only if the **workflow itself** changed. Do not copy skill text into domain docs.

Exception — InternSafar flow-trace skills (`.agents/skills/ip-trace-*`, listed in `SKILLS_MAP.md`): they name concrete files, invariants and known risks, so update the matching one in the same task when that flow's behaviour, files, or contracts change (or when a listed known risk is fixed).
