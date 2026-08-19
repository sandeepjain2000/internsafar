# -*- coding: utf-8 -*-
"""Apply QA results to test-cases/Internship_Portal_Test_Checklist.xlsx (wrapper)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "scripts" / "ip_checklist_xlsx.py"


def main():
    cmd = [sys.executable, str(TARGET)]
    if len(sys.argv) > 1:
        cmd.append(sys.argv[1])
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
