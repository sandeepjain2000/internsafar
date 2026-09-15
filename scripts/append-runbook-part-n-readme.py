#!/usr/bin/env python3
"""Append Part N — handoff zip contents / README note to CRISP (1)(1) runbook."""
from docx import Document
from docx.enum.text import WD_BREAK
from docx.shared import Pt

DOC_PATH = r"C:\Users\place\Work\UIUX Migration\InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx"
MARKER = "Part N — Handoff zip contents (README file tree)"


def add_mono(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.name = "Consolas"
    run.font.size = Pt(9)
    return p


def main():
    doc = Document(DOC_PATH)
    existing = "\n".join(p.text for p in doc.paragraphs)
    if MARKER in existing:
        print("Part N already present — skip")
        return

    doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    doc.add_heading(MARKER, level=1)
    doc.add_paragraph(
        "The shareable package is internship-portal-aws-handoff.zip. After unzip on EC2 "
        "(or on Windows), open README.txt first. That README lists the COMPLETE folder "
        "structure and every file path in the handoff (docs, app .tar.gz, migrations/, runner/)."
    )
    doc.add_paragraph("Expected top-level layout inside the unzipped handoff:")
    for line in [
        "internship-portal-aws-handoff/",
        "├── README.txt                 ← complete handoff file tree + inventory (start here)",
        "├── APP-TAR-FOLDER-STRUCTURE.txt ← app archive folder map (also APP-FOLDER-STRUCTURE.txt in tar)",
        "├── ISSUES-FIXED.txt           ← which AWS issues this pack fixes",
        "├── AWS-DEPLOY.md              ← Path B pastable + Path C + .env",
        "├── SETUP-NOTES.txt            ← short checklist",
        "├── DB-REFERENCE.md",
        "├── DB-SCRIPTS-REFERENCE.txt",
        "├── internship-portal-aws-deploy-*.tar.gz   ← full app source",
        "├── migrations/                ← 40 SQL files (001–039)",
        "└── runner/                    ← MIGRATION_MANIFEST.txt, db_migrate_sql_only_ip.mjs, db_exec_sql_file.js",
    ]:
        add_mono(doc, line)

    doc.add_paragraph(
        "Also share this runbook docx alongside the zip. Path B pastable commands: Part M. "
        "Fresh RDS: Step 23 (npm run deploy:fresh-aws-db). Auth: NEXTAUTH_URL + NEXTAUTH_SECRET "
        "then npm run build and pm2 restart internsafar --update-env."
    )
    doc.add_paragraph(
        "Credentials: NEW production .env / Google client id+secret are provided SEPARATELY "
        "(not inside the zip). Do not reuse old EC2 .env — see Part O."
    )
    doc.save(DOC_PATH)
    print(f"Updated: {DOC_PATH}")


if __name__ == "__main__":
    main()
