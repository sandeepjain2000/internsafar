# Context update policy

## Update `docs/ai-context/**` when there is a confirmed change to

- Major architecture or domain boundaries
- Auth / session model
- Database conventions or migrate gates
- Deploy Path B/C rules
- Stable product decisions
- Project-wide agent conventions
- Folder / route map when new top-level areas or role pages land
- Related-folder map if workspace folders move/rename

## Do not update for

- Isolated CSS / copy tweaks
- Ordinary bug fixes
- Temporary debugging
- Speculative ideas
- Every PR or chat

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

Last zip rebuild: **2026-09-23**.

## Skills

Update a skill only if the **workflow itself** changed. Do not copy skill text into domain docs.
