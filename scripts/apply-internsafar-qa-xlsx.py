# -*- coding: utf-8 -*-
"""Apply qa-results.json onto InternSafar-Test-Cases.xlsx (Legacy ID + ID unified).

Also stamps today's date on the Index sheet and writes a dated copy:
  test-cases/InternSafar-Test-Cases-YYYY-MM-DD.xlsx
while keeping the canonical InternSafar-Test-Cases.xlsx in sync.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.internsafar_xlsx_cols import (  # noqa: E402
    ACTUAL_ALIASES,
    DATE_ALIASES,
    ID_ALIASES,
    LEGACY_ALIASES,
    STATUS_ALIASES,
    dated_xlsx_path,
    results_as_of_label,
    stable_xlsx_path,
    stamp_index_for_results,
)

XLSX = stable_xlsx_path(ROOT)
RESULTS = ROOT / "test-cases" / "qa-results.json"
SKIP = frozenset({"Index", "Coverage", "Coverage Matrix", "Notes", "How to use", "Meta"})
# Manual Google / OTP results — do not overwrite with automated Blocked/Not Run.
MANUAL_ONLY_TC_IDS = frozenset(
    {
        "TC-IS-06-007",
        "TC-IS-02-027",
        "TC-IS-03-001",
        "TC-IS-03-006",
        "TC-IS-03-007",
        "TC-IS-03-008",
        "TC-IS-03-011",
        "TC-IS-03-013",
        "TC-IS-03-015",
        "TC-IS-03-019",
        "TC-IS-03-020",
        "TC-IS-03-022",
        "TC-IS-03-023",
    }
)

PASS_FILL = PatternFill("solid", fgColor="C6EFCE")
PASS_FONT = Font(bold=True, color="006100", name="Calibri")
FAIL_FILL = PatternFill("solid", fgColor="FFC7CE")
FAIL_FONT = Font(bold=True, color="9C0006", name="Calibri")
BLOCK_FILL = PatternFill("solid", fgColor="D9D9D9")
BLOCK_FONT = Font(bold=True, color="595959", name="Calibri")
NOTRUN_FILL = PatternFill("solid", fgColor="FFF2CC")
STYLE = {
    "Pass": (PASS_FILL, PASS_FONT),
    "Fail": (FAIL_FILL, FAIL_FONT),
    "Blocked": (BLOCK_FILL, BLOCK_FONT),
    "Not Run": (NOTRUN_FILL, Font(name="Calibri")),
}

# openpyxl / OOXML reject control chars and ANSI escapes from Playwright dumps
_ANSI_RE = __import__("re").compile(r"\x1B\[[0-9;?]*[ -/]*[@-~]")
_ILLEGAL_XML_RE = __import__("re").compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def sanitize_excel_text(value):
    if value is None:
        return None
    if not isinstance(value, str):
        value = json.dumps(value)
    return _ILLEGAL_XML_RE.sub(" ", _ANSI_RE.sub("", value))[:2000]


def find_header(ws):
    for r in range(1, 12):
        vals = [ws.cell(r, c).value for c in range(1, min(ws.max_column, 30) + 1)]
        if not vals:
            continue
        has_id = any(v in vals for v in ID_ALIASES)
        has_status = any(v in vals for v in STATUS_ALIASES)
        if has_id and has_status:
            cols = {str(v): i + 1 for i, v in enumerate(vals) if v}
            return r, cols
    return None, {}


def col_of(cols, aliases):
    for a in aliases:
        if a in cols:
            return cols[a]
    return None


def style_status(cell, status: str):
    fill, font = STYLE.get(status, (NOTRUN_FILL, Font(name="Calibri")))
    cell.value = status
    cell.fill = fill
    cell.font = font
    cell.alignment = Alignment(vertical="top", wrap_text=True)


def main():
    payload = json.loads(RESULTS.read_text(encoding="utf-8"))
    legacy_cases = payload.get("cases") or {}
    extra = payload.get("byTcId") or {}
    unified = dict(legacy_cases)
    unified.update(extra)
    unified.update(payload.get("results") or {})
    executed = payload.get("executedAt") or datetime.now(timezone.utc).isoformat()
    as_of = results_as_of_label()

    if not XLSX.exists():
        raise SystemExit(f"Missing workbook: {XLSX}")

    wb = load_workbook(XLSX)
    updated = 0
    seen_legacy = set()

    for ws in wb.worksheets:
        if ws.title in SKIP:
            continue
        hr, cols = find_header(ws)
        if not hr:
            continue
        sc = col_of(cols, STATUS_ALIASES)
        ac = col_of(cols, ACTUAL_ALIASES)
        ec = col_of(cols, DATE_ALIASES)
        lc = col_of(cols, LEGACY_ALIASES)
        tc = col_of(cols, ID_ALIASES)
        if not sc:
            continue
        for r in range(hr + 1, ws.max_row + 1):
            tc_id = ws.cell(r, tc).value if tc else None
            legacy = (ws.cell(r, lc).value if lc else None) or ""
            legacy = str(legacy).strip()
            if tc_id and str(tc_id) in MANUAL_ONLY_TC_IDS:
                continue
            rec = None
            if tc_id and str(tc_id) in unified:
                rec = unified[str(tc_id)]
            elif legacy and legacy in unified:
                rec = unified[legacy]
                seen_legacy.add(legacy)
            if not rec:
                continue
            status = rec.get("status") or "Not Run"
            actual = sanitize_excel_text(rec.get("actual"))
            style_status(ws.cell(r, sc), status)
            if ac:
                ws.cell(r, ac).value = actual
                ws.cell(r, ac).alignment = Alignment(vertical="top", wrap_text=True)
            if ec:
                ws.cell(r, ec).value = executed
            updated += 1

    stamp_index_for_results(wb, as_of=as_of, executed_iso=executed)

    dated = dated_xlsx_path(ROOT, date_from_label(as_of))
    wb.save(XLSX)
    wb.save(dated)

    leftover = sorted(k for k in legacy_cases if k not in seen_legacy)
    print(
        json.dumps(
            {
                "updatedRows": updated,
                "resultCases": len(unified),
                "extraTcIds": len(extra),
                "unmatchedLegacyIds": leftover,
                "asOf": as_of,
                "canonical": str(XLSX.relative_to(ROOT)).replace("\\", "/"),
                "datedExport": str(dated.relative_to(ROOT)).replace("\\", "/"),
            }
        )
    )
    if leftover:
        print("Unmatched Legacy IDs (no row):", ", ".join(leftover[:40]))


def date_from_label(label: str):
    from datetime import date

    return date.fromisoformat(label)


if __name__ == "__main__":
    main()
