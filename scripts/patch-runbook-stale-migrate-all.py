#!/usr/bin/env python3
"""One-shot patches for stale Part P wording (kept for history; prefer scrub-runbook-deprecated-paths.py)."""
from docx import Document

DOC_PATH = r"C:\Users\place\Work\UIUX Migration\InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx"

REPLACEMENTS = [
    (
        "db:migrate:all still exists — it was not removed",
        "Part P — Database commands (current)",
    ),
    (
        "SUPERSEDED BY PART R: db:migrate:all was DELETED from the pack (not kept as a stub).",
        "Use only: Path B = no DB migrate; Path C = npm run deploy:fresh-aws-db; "
        "SQL-only when demo users exist = npm run db:migrate:sql-only. Details in Part R.",
    ),
    (
        "npm run db:migrate:all still runs all IP SQL files (001–039) in manifest order. "
        "That is SQL-only — it does not run IP_Reset_Core_Sample.",
        "When demo users already exist: npm run db:migrate:sql-only. "
        "Fresh RDS: npm run deploy:fresh-aws-db only.",
    ),
    (
        "db:migrate:all and deploy:fresh-aws-db stop at the first failed file (also treat spawn errors and kill signals as failure).",
        "db:migrate:sql-only and deploy:fresh-aws-db stop at the first failed file.",
    ),
]


def main():
    doc = Document(DOC_PATH)
    changed = 0
    for p in doc.paragraphs:
        for old, new in REPLACEMENTS:
            if old in p.text:
                p.text = p.text.replace(old, new)
                changed += 1
    doc.save(DOC_PATH)
    print(f"Updated {DOC_PATH} ({changed} replacements). Prefer scrub-runbook-deprecated-paths.py for full wipe.")


if __name__ == "__main__":
    main()
