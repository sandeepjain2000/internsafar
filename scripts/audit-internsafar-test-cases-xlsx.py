#!/usr/bin/env python3
"""Print full InternSafar-Test-Cases.xlsx status summary (all TC-IS rows).

Use after partial QA runs so reports always include workbook-wide totals,
not just the cases executed in the current session.

  python scripts/audit-internsafar-test-cases-xlsx.py
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.internsafar_xlsx_cols import ID_ALIASES, STATUS_ALIASES  # noqa: E402

XLSX = ROOT / "test-cases" / "InternSafar-Test-Cases.xlsx"
SKIP = frozenset({"Index", "Coverage", "Coverage Matrix", "Notes", "How to use", "Meta"})


def col_of(cols, aliases):
    for a in aliases:
        if a in cols:
            return cols[a]
    return None


def audit(path: Path = XLSX) -> dict:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    overall: Counter = Counter()
    by_auto: dict[str, Counter] = defaultdict(Counter)
    by_sheet: dict[str, Counter] = defaultdict(Counter)
    non_pass: list[dict] = []

    for ws in wb.worksheets:
        if ws.title in SKIP:
            continue
        hr = None
        cols: dict[str, int] = {}
        for r in range(1, 12):
            vals = [ws.cell(r, c).value for c in range(1, 30)]
            if vals and any(v in vals for v in ID_ALIASES) and any(v in vals for v in STATUS_ALIASES):
                hr = r
                cols = {str(v): i + 1 for i, v in enumerate(vals) if v}
                break
        if not hr:
            continue
        tc_col = col_of(cols, ID_ALIASES)
        st_col = col_of(cols, STATUS_ALIASES)
        auto_col = cols.get("Automation")
        leg_col = cols.get("Legacy ID")
        for r in range(hr + 1, ws.max_row + 1):
            tc = ws.cell(r, tc_col).value if tc_col else None
            if not tc or not str(tc).startswith("TC-IS-"):
                continue
            status = (ws.cell(r, st_col).value or "Not Run")
            status = str(status).strip()
            automation = (
                (ws.cell(r, auto_col).value or "Unknown").strip() if auto_col else "Unknown"
            )
            overall[status] += 1
            by_auto[str(automation)][status] += 1
            by_sheet[ws.title][status] += 1
            if status != "Pass":
                legacy = ws.cell(r, leg_col).value if leg_col else ""
                non_pass.append(
                    {
                        "tcId": str(tc),
                        "sheet": ws.title,
                        "status": status,
                        "automation": automation,
                        "legacyId": str(legacy or "").strip(),
                    }
                )

    wb.close()
    total = sum(overall.values())
    return {
        "workbook": str(path),
        "totalTcIs": total,
        "byStatus": dict(overall),
        "byAutomation": {k: dict(v) for k, v in sorted(by_auto.items())},
        "bySheet": {k: dict(v) for k, v in sorted(by_sheet.items())},
        "nonPassCount": len(non_pass),
        "nonPass": non_pass,
    }


def main():
    report = audit()
    print(json.dumps(report, indent=2))
    s = report["byStatus"]
    print(
        f"\nTOTAL {report['totalTcIs']}  Pass={s.get('Pass', 0)}  "
        f"Fail={s.get('Fail', 0)}  Blocked={s.get('Blocked', 0)}  "
        f"Not Run={s.get('Not Run', 0)}"
    )


if __name__ == "__main__":
    main()
