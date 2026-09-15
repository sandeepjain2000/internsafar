# -*- coding: utf-8 -*-
"""Shared InternSafar workbook column schema (Boarders names + IP extras)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

# Boarders order first, then InternSafar keep/extra columns.
COLS = [
    "ID",
    "Module / Section",
    "Type",
    "Issue Summary",
    "Description",
    "Suggestion / Expected Behaviour",
    "Reference",
    "Doc Status",
    "Severity / Priority",
    "Test Status",
    "Date Verified",
    "Comments / Notes",
    "Dev comment",
    "Requirement",
    "Phase",
    "Estimate Hr",
    # InternSafar keep / extras
    "Role(s)",
    "Preconditions",
    "Actual Result",
    "Automation",
    "Feature",
    "Legacy ID",
]

# Old InternSafar header → new Boarders-aligned name
OLD_TO_NEW = {
    "TC ID": "ID",
    "Module": "Module / Section",
    "Feature": "Feature",
    "Title": "Issue Summary",
    "Priority": "Severity / Priority",
    "Type": "Type",
    "Role(s)": "Role(s)",
    "Preconditions": "Preconditions",
    "Test Steps": "Description",
    "Expected Result": "Suggestion / Expected Behaviour",
    "Test Data / Notes": "Comments / Notes",
    "Automation": "Automation",
    "Status": "Test Status",
    "Actual Result": "Actual Result",
    "Executed At": "Date Verified",
    "Legacy ID": "Legacy ID",
}

ID_ALIASES = ("ID", "TC ID")
STATUS_ALIASES = ("Test Status", "Status")
ACTUAL_ALIASES = ("Actual Result",)
DATE_ALIASES = ("Date Verified", "Executed At")
LEGACY_ALIASES = ("Legacy ID",)

STABLE_XLSX_NAME = "InternSafar-Test-Cases.xlsx"


def results_as_of_label(d: date | None = None) -> str:
    """Calendar day stamp used in Index title + dated filename (local)."""
    return (d or date.today()).isoformat()


def dated_xlsx_name(d: date | None = None) -> str:
    return f"InternSafar-Test-Cases-{results_as_of_label(d)}.xlsx"


def stable_xlsx_path(root: Path | str) -> Path:
    return Path(root) / "test-cases" / STABLE_XLSX_NAME


def dated_xlsx_path(root: Path | str, d: date | None = None) -> Path:
    return Path(root) / "test-cases" / dated_xlsx_name(d)


def stamp_index_for_results(wb, as_of: str | None = None, executed_iso: str | None = None) -> str:
    """
    Put today's results date on Index (title + banner). Returns the as-of label used.
    """
    label = as_of or results_as_of_label()
    executed = executed_iso or datetime.now(timezone.utc).isoformat()
    if "Index" not in wb.sheetnames:
        return label
    idx = wb["Index"]
    idx["A1"] = f"InternSafar — Test Case Index ({label})"
    idx["A3"] = (
        f"Results as of {label}. Last apply (UTC): {executed}. "
        f"Dated export: {dated_xlsx_name(date.fromisoformat(label))} "
        f"(canonical copy remains {STABLE_XLSX_NAME})."
    )
    try:
        from openpyxl.styles import Alignment, Font

        idx["A1"].font = Font(bold=True, size=16, name="Calibri")
        idx["A3"].alignment = Alignment(wrap_text=True, vertical="top")
        idx.merge_cells("A3:G3")
        idx.row_dimensions[3].height = 36
    except Exception:
        pass
    return label
