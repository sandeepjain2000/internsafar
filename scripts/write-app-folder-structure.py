#!/usr/bin/env python3
"""
Write APP-FOLDER-STRUCTURE.txt for the Internship Portal app archive.

Lists appropriate top-level files/folders and one-level (or key) children —
not every source file (~1400). Used inside the app .tar.gz and copied into
the handoff zip as APP-TAR-FOLDER-STRUCTURE.txt.
"""
from __future__ import annotations

from pathlib import Path
import sys

EXCLUDE_DIRS = {
    "node_modules",
    ".next",
    ".vercel",
    ".git",
    "test-results",
    "tmp-screenshots",
    ".local-qa-2fa-bypass-backup",
    ".cursor",
    "coverage",
    "playwright-report",
    ".turbo",
    "out",
    "build",
    ".netlify",
    ".cache",
    "aws-migration",
}

# Directories expanded one level (sorted file/dir names)
EXPAND_ONE_LEVEL = {
    "db",
    "docs",
    "git-scripts",
    "public",
    "qa",
    "scripts",
    "src",
    "test-cases",
    ".agents",
}

# Under these, expand one more level for orientation
EXPAND_TWO_LEVEL = {
    "src": {"app", "components", "lib"},
    "db": {"migrations"},
    "scripts": set(),  # list key script names only via KEY_FILES
    "qa": {"docs"},
}

KEY_SCRIPT_NAMES = [
    "assert-db-migrate-allowed.js",
    "deploy-fresh-aws-db.mjs",
    "db_migrate_sql_only_ip.mjs",
    "db_exec_sql_file.js",
    "IP_Reset_Core_Sample.js",
    "MIGRATION_MANIFEST.txt",
    "SCRIPTS-README.md",
    "build-aws-handoff.ps1",
    "write-handoff-readme.py",
    "write-app-folder-structure.py",
    "linux-safe-archive.py",
]


def count_files(path: Path) -> int:
    n = 0
    for p in path.rglob("*"):
        if not p.is_file():
            continue
        if any(part in EXCLUDE_DIRS for part in p.parts):
            continue
        n += 1
    return n


def list_children(path: Path) -> tuple[list[Path], list[Path]]:
    dirs, files = [], []
    if not path.is_dir():
        return dirs, files
    for p in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        if p.name in EXCLUDE_DIRS:
            continue
        if p.name.startswith(".") and p.name not in {".agents", ".env.example", ".gitignore"}:
            if p.is_file() and p.name.startswith(".env"):
                continue
        if p.is_dir():
            dirs.append(p)
        else:
            files.append(p)
    return dirs, files


def build_structure(app_root: Path) -> str:
    total = count_files(app_root)
    lines: list[str] = [
        "InternSafar — App archive folder structure",
        "==========================================",
        "",
        "This file is inside internship-portal-aws-deploy-*.tar.gz (and copied to the",
        "handoff zip as APP-TAR-FOLDER-STRUCTURE.txt).",
        "",
        f"App root after extract: internship-portal/  (~{total} files in this archive;",
        "node_modules / .next / secrets are excluded from the pack).",
        "",
        "AWS DB routing (read AGENTS.md before any migrate):",
        "  Path B (app update)     → do NOT run any DB migrate/seed; do NOT set IP_ALLOW_DB_MIGRATE",
        "  Path C (fresh RDS)      → IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db",
        "  Demo users already exist → IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only",
        "  Code gate: scripts/assert-db-migrate-allowed.js (=== BLOCKED === without allow)",
        "  Success = === OK === banners + exit 0; === FAIL === / === BLOCKED === = stop",
        "  Write-up: PATH-B-NO-DB-MIGRATE.txt (in handoff zip)",
        "",
        "Tree (appropriate folders + key files — not every source file)",
        "--------------------------------------------------------------",
        "internship-portal/",
    ]

    top_dirs, top_files = list_children(app_root)

    # Top-level files first
    for i, f in enumerate(top_files):
        last = i == len(top_files) - 1 and not top_dirs
        branch = "└── " if last else "├── "
        note = ""
        if f.name == "AGENTS.md":
            note = "  ← Cursor: AWS DB script routing"
        elif f.name == "APP-FOLDER-STRUCTURE.txt":
            note = "  ← this file"
        elif f.name == "README.md":
            note = "  ← product overview / local setup"
        elif f.name == ".env.example":
            note = "  ← template only (no real secrets in pack)"
        lines.append(f"{branch}{f.name}{note}")

    for di, d in enumerate(top_dirs):
        last_dir = di == len(top_dirs) - 1
        prefix = "└── " if last_dir else "├── "
        mid = "    " if last_dir else "│   "
        file_count = count_files(d)
        lines.append(f"{prefix}{d.name}/  ({file_count} files)")

        if d.name not in EXPAND_ONE_LEVEL:
            lines.append(f"{mid}└── … (see live tree after extract)")
            continue

        sub_dirs, sub_files = list_children(d)

        # scripts: highlight key files + count rest
        if d.name == "scripts":
            shown = []
            for name in KEY_SCRIPT_NAMES:
                p = d / name
                if p.is_file():
                    shown.append(p)
            other = [p for p in sub_files if p not in shown]
            aws_docs = d / "aws-handoff-docs"
            items: list[tuple[str, str]] = [(p.name, "") for p in shown]
            if aws_docs.is_dir():
                items.append(("aws-handoff-docs/", f"{count_files(aws_docs)} handoff doc sources"))
            if other:
                items.append((f"… +{len(other)} other scripts", "see SCRIPTS-README.md"))
            for ii, (name, note) in enumerate(items):
                last_i = ii == len(items) - 1
                b = "└── " if last_i else "├── "
                suffix = f"  ← {note}" if note else ""
                lines.append(f"{mid}{b}{name}{suffix}")
            continue

        # db/migrations: count SQL, list range
        if d.name == "db":
            mig = d / "migrations"
            kids = []
            if mig.is_dir():
                sql = sorted(mig.glob("*.sql"))
                kids.append(("migrations/", f"{len(sql)} SQL files (001–039 in handoff manifest)"))
            for p in sub_files:
                kids.append((p.name, ""))
            for ii, (name, note) in enumerate(kids):
                last_i = ii == len(kids) - 1
                b = "└── " if last_i else "├── "
                suffix = f"  ← {note}" if note else ""
                lines.append(f"{mid}{b}{name}{suffix}")
            continue

        # src: app / components / lib
        if d.name == "src":
            expand = EXPAND_TWO_LEVEL.get("src", set())
            entries = [(p, True) for p in sub_dirs] + [(p, False) for p in sub_files]
            for ii, (p, is_dir) in enumerate(entries):
                last_i = ii == len(entries) - 1
                b = "└── " if last_i else "├── "
                nest = f"{mid}{'    ' if last_i else '│   '}"
                if is_dir:
                    lines.append(f"{mid}{b}{p.name}/  ({count_files(p)} files)")
                    if p.name in expand:
                        sd, sf = list_children(p)
                        # show only directory names under app (routes), capped
                        show = sd[:20]
                        extra = len(sd) - len(show)
                        for ji, c in enumerate(show):
                            last_j = ji == len(show) - 1 and extra <= 0 and not sf
                            bb = "└── " if last_j else "├── "
                            lines.append(f"{nest}{bb}{c.name}/")
                        if extra > 0:
                            lines.append(f"{nest}└── … +{extra} more route folders")
                        elif sf:
                            lines.append(f"{nest}└── ({len(sf)} files at this level)")
                else:
                    lines.append(f"{mid}{b}{p.name}")
            continue

        # default one-level expand
        entries = [(p, True) for p in sub_dirs] + [(p, False) for p in sub_files]
        # cap long lists
        cap = 25
        shown_entries = entries[:cap]
        for ii, (p, is_dir) in enumerate(shown_entries):
            last_i = ii == len(shown_entries) - 1 and len(entries) <= cap
            b = "└── " if last_i else "├── "
            label = f"{p.name}/" if is_dir else p.name
            extra = f"  ({count_files(p)} files)" if is_dir else ""
            lines.append(f"{mid}{b}{label}{extra}")
        if len(entries) > cap:
            lines.append(f"{mid}└── … +{len(entries) - cap} more")

    lines.extend(
        [
            "",
            "Handoff deliverables (outside this tar — see zip README.txt)",
            "-----------------------------------------------------------",
            "internship-portal-aws-handoff.zip",
            "├── README.txt                         ← full handoff file tree + inventory",
            "├── APP-TAR-FOLDER-STRUCTURE.txt       ← copy of this structure (no need to untar)",
            "├── AWS-DEPLOY.md / SETUP-NOTES.txt / DB-*.md|txt / ISSUES-FIXED.txt",
            "├── internship-portal-aws-deploy-*.tar.gz   ← this app archive",
            "├── migrations/                        ← 40 SQL files",
            "└── runner/                            ← SQL-only helper (demo users already exist)",
            "",
            "Also share: InternSafar_AWS_Deployment_Runbook_CRISP_COMPLETE_FINAL (1) (1).docx",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    app_root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else app_root / "APP-FOLDER-STRUCTURE.txt"
    if not app_root.is_dir():
        raise SystemExit(f"Missing app root: {app_root}")
    text = build_structure(app_root)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8", newline="\n")
    print(f"Wrote {out} ({len(text.splitlines())} lines)")


if __name__ == "__main__":
    main()
