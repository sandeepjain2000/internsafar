#!/usr/bin/env python3
"""Remove deprecated / nonexistent migrate path mentions from the CRISP runbook."""
from docx import Document

DOC_PATH = r"C:\Users\place\Work\UIUX Migration\InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx"

BAN_SUBSTR = (
    "db:migrate:all",
    "db_migrate_all",
    "allow-sql-only",
    "migrate-and-seed",
    "SUPERSEDED BY PART R",
    "still exists — it was not removed",
    "DELETED from the pack",
    "were DELETED",
    "not deprecated-in-place",
    "Old name db:migrate",
)


def scrub_text(text: str) -> str | None:
    if not text:
        return None
    lower = text.lower()

    if "do not run migrate-and-seed" in lower:
        return "Confirm === OK === banners and exit code 0 before continuing"

    if "do not run db:migrate:all" in lower:
        return "Confirm === OK === banners and exit code 0 before continuing"

    if text.strip() == "db:migrate:all / handoff runner alone":
        return "Path B — app code update only"

    if "never on fresh rds without core seed" in lower and "db:migrate" in lower:
        return "Do not run any DB migrate/seed (swap app + build + PM2 only)"

    if text.strip().startswith("Old name db:migrate"):
        return "Path B — app code update only"

    if "part p —" in lower and ("migration" in lower or "database" in lower):
        if "current" not in lower:
            return "Part P — Database commands (current)"

    if "part q —" in lower and "cursor" in lower:
        if "current" not in lower:
            return "Part Q — Agent DB routing (current)"

    if "db_migrate_all" in lower:
        return text.replace("db_migrate_all_ip.mjs", "db_migrate_sql_only_ip.mjs").replace(
            "db_migrate_all", "db_migrate_sql_only"
        )

    if any(b.lower() in lower for b in BAN_SUBSTR):
        return (
            "Use: Path B = no DB migrate; Path C = npm run deploy:fresh-aws-db; "
            "existing demo users = npm run db:migrate:sql-only."
        )
    return None


def main():
    doc = Document(DOC_PATH)
    changed = 0

    for p in doc.paragraphs:
        new = scrub_text(p.text)
        if new is not None and new != p.text:
            p.text = new
            changed += 1

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                # Prefer first paragraph scrub so merged cells stay coherent
                for para in cell.paragraphs:
                    new = scrub_text(para.text)
                    if new is not None and new != para.text:
                        para.text = new
                        changed += 1
                # Exact cell replacements for tool tables
                ct = cell.text.strip()
                if ct == "db:migrate:all / handoff runner alone":
                    cell.text = "Path B — app code update only"
                    changed += 1
                elif ct == "Never on fresh RDS without core seed first":
                    cell.text = "Do not run any DB migrate/seed (swap app + build + PM2 only)"
                    changed += 1
                elif ct.startswith("Old name db:migrate"):
                    cell.text = "Path B — app code update only"
                    changed += 1
                elif ct == "npm run db:migrate:sql-only (when demo users already exist)" and "Old name" in "".join(
                    c.text for c in row.cells
                ):
                    # paired with Old name row — make it Path B command
                    pass

    # Fix T2 row that paired Old name → ensure Path B row
    if len(doc.tables) >= 3:
        t2 = doc.tables[2]
        if len(t2.rows) >= 4:
            left = t2.rows[3].cells[0].text
            if "Path B" in left or "Old name" in left or "db:migrate:all" in left:
                t2.rows[3].cells[0].text = "Path B — app code update only"
                t2.rows[3].cells[1].text = "Do not run any DB migrate/seed"
                changed += 1

    # Final sweep
    for p in doc.paragraphs:
        if any(b.lower() in p.text.lower() for b in BAN_SUBSTR):
            p.text = (
                "Use: Path B = no DB migrate; Path C = npm run deploy:fresh-aws-db; "
                "existing demo users = npm run db:migrate:sql-only."
            )
            changed += 1
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if any(b.lower() in cell.text.lower() for b in BAN_SUBSTR):
                    for para in cell.paragraphs:
                        if any(b.lower() in para.text.lower() for b in BAN_SUBSTR):
                            para.text = scrub_text(para.text) or (
                                "Use Path B / Path C / db:migrate:sql-only only — see Part R."
                            )
                            changed += 1

    doc.save(DOC_PATH)
    print(f"Updated {DOC_PATH} ({changed} edits)")


if __name__ == "__main__":
    main()
