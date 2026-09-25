# -*- coding: utf-8 -*-
"""
Phase 1: Sync InternSafar-Test-Cases.xlsx to current product.

- Obsolete removed home-Google login cases
- Edit stale Google / home wording
- Add P1/P2 + journey gap cases
- Normalize Automation to Automated | Manual | Obsolete
- Refresh Index date stamp

  python scripts/sync-internsafar-xlsx-product-hygiene.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from lib.internsafar_xlsx_cols import COLS  # noqa: E402

XLSX = ROOT / "test-cases" / "InternSafar-Test-Cases.xlsx"

BODY = Font(name="Calibri", size=11)
NOTRUN = PatternFill("solid", fgColor="FFF2CC")
OBSOLETE_FILL = PatternFill("solid", fgColor="D9D9D9")
WRAP = Alignment(vertical="top", wrap_text=True)

# Known Playwright-mapped / automated TC-IS ids (expand with journeys)
AUTOMATED_IDS = {
    "TC-IS-01-001",
    "TC-IS-01-002",
    "TC-IS-01-004",
    "TC-IS-01-005",
    "TC-IS-01-007",
    "TC-IS-02-001",
    "TC-IS-02-015",
    "TC-IS-02-024",
    "TC-IS-02-025",
    "TC-IS-02-026",
    "TC-IS-03-005",
    "TC-IS-04-001",
    "TC-IS-04-007",
    "TC-IS-06-010",
    "TC-IS-07-007",
    "TC-IS-07-022",
    "TC-IS-07-023",
    "TC-IS-09-015",
    "TC-IS-09-017",
    "TC-IS-14-023",
    "TC-IS-18-030",
    "TC-IS-18-039",
    "TC-IS-18-040",
    "TC-IS-18-041",
    "TC-IS-18-042",
    "TC-IS-18-043",
    "TC-IS-18-044",
    "TC-IS-18-045",
    "TC-IS-18-046",
    "TC-IS-18-047",
}

OBSOLETE_IDS = {
    # Removed from workbook 2026-09-25 (home Google login gone):
    # TC-IS-02-027, TC-IS-03-021
    # Removed: TC-IS-14-013 SuperAdmin viral UI (redirect-only)
}

EDITS = {
    "TC-IS-02-024": {
        "Issue Summary": "Candidate register Sign up with Google reaches accounts.google.com with matching redirect_uri",
        "Description": (
            "1. Open `/register/candidate` signed out.\n"
            "2. Click Sign up with Google (button.ip-crg-google-btn).\n"
            "3. Stop on Google accounts URL; inspect client_id and redirect_uri.\n"
            "4. Confirm home `/` has no Google login button."
        ),
        "Suggestion / Expected Behaviour": (
            "Browser reaches accounts.google.com. redirect_uri is `{origin}/api/auth/callback/google` "
            "matching the app origin. Home `/` has email/password only (no Sign in with Google)."
        ),
        "Automation": "Automated",
        "Comments / Notes": "Playwright: qa/tests/google-auth.spec.js",
        "Legacy ID": "AUTH-GOOGLE-1",
    },
    "TC-IS-02-025": {
        "Issue Summary": "GoogleLoginDisabled / GoogleAccountNotLinked show friendly message",
        "Description": (
            "1. Open `/?error=GoogleLoginDisabled`.\n"
            "2. Open `/?error=GoogleAccountNotLinked`.\n"
            "3. Read the banner/message."
        ),
        "Suggestion / Expected Behaviour": (
            "Friendly copy that Google sign-in is not available — use email/password. Not a raw NextAuth dump."
        ),
        "Automation": "Automated",
    },
    "TC-IS-18-030": {
        "Issue Summary": "Home email/password only; register exposes Google OAuth; password login still works",
        "Description": (
            "1. Open `/` — confirm #email/#password and no Google button.\n"
            "2. Open `/register/candidate` — confirm Sign up with Google.\n"
            "3. Sign in with core candidate email/password."
        ),
        "Suggestion / Expected Behaviour": (
            "Home never offers Google login. Register starts Google OAuth for verification/create. "
            "Credentials login remains independent."
        ),
        "Automation": "Automated",
    },
}

NEW_CASES = [
    {
        "ID": "TC-IS-09-015",
        "sheet": "09 Employer Postings Pipeline",
        "Module / Section": "09 Employer Postings Pipeline",
        "Feature": "Employer profile completeness",
        "Type": "Regression",
        "Issue Summary": "Employer profile required fields show asterisk markers",
        "Description": (
            "1. Sign in as core employer.\n"
            "2. Open `/employer/profile`.\n"
            "3. Inspect labels for company name, website, work email, industry, HQ city, "
            "contact name/phone, business entity type."
        ),
        "Suggestion / Expected Behaviour": (
            "Each required-for-complete field shows a visible * (required) marker. "
            "Matches REQUIRED_FOR_COMPLETE in src/lib/employerProfileComplete.js."
        ),
        "Role(s)": "Employer",
        "Preconditions": "Core employer account",
        "Automation": "Automated",
        "Severity / Priority": "High",
        "Doc Status": "Ready for QA",
        "Phase": "P1 / industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright: journeys-employer.spec.js JOURNEY-EMP-01",
    },
    {
        "ID": "TC-IS-09-016",
        "sheet": "09 Employer Postings Pipeline",
        "Module / Section": "09 Employer Postings Pipeline",
        "Feature": "Posting locations",
        "Type": "Functional",
        "Issue Summary": "New/edit posting locations use State and City fields",
        "Description": (
            "1. Employer opens `/employer/internships/new` (or edit).\n"
            "2. Locate location inputs from PostingLocationsFields."
        ),
        "Suggestion / Expected Behaviour": (
            "State and City are separate controls (not a single free-text location only). "
            "API still stores city names in locations JSONB."
        ),
        "Role(s)": "Employer",
        "Preconditions": "Approved employer with profile complete",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "P2 / industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright: journeys-employer.spec.js JOURNEY-EMP-03; UI: PostingLocationsFields.jsx",
    },
    {
        "ID": "TC-IS-09-017",
        "sheet": "09 Employer Postings Pipeline",
        "Module / Section": "09 Employer Postings Pipeline",
        "Feature": "Employer dashboard",
        "Type": "Regression",
        "Issue Summary": "Employer dashboard Action center sections visible",
        "Description": "1. Sign in as core employer.\n2. Open `/employer`.\n3. Locate Action center.",
        "Suggestion / Expected Behaviour": (
            "Action center shows Action required / Upcoming style sections "
            "(data-testid=employer-action-center)."
        ),
        "Role(s)": "Employer",
        "Preconditions": "Core employer",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright IS-063 / journeys-employer",
    },
    {
        "ID": "TC-IS-14-023",
        "sheet": "14 SuperAdmin Ops",
        "Module / Section": "14 SuperAdmin Ops",
        "Feature": "Posting moderation",
        "Type": "Regression",
        "Issue Summary": "SuperAdmin re-applying same posting status skips notify/email",
        "Description": (
            "1. As SuperAdmin, pick a posting already `published`.\n"
            "2. PATCH `/api/ip/superadmin/postings` with status=published again.\n"
            "3. Inspect JSON: skipped increments; changed stays 0 for that id."
        ),
        "Suggestion / Expected Behaviour": (
            "When current_status === target status, API returns ok with changed=false and does not call notifyUser."
        ),
        "Role(s)": "SuperAdmin",
        "Preconditions": "At least one published internship",
        "Automation": "Automated",
        "Severity / Priority": "High",
        "Doc Status": "Ready for QA",
        "Phase": "P1 / industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright journeys-superadmin.spec.js JOURNEY-SA-01",
    },
    {
        "ID": "TC-IS-18-047",
        "sheet": "18 Cross-cutting",
        "Module / Section": "18 Cross-cutting",
        "Feature": "Email unsubscribe",
        "Type": "Negative",
        "Issue Summary": "Unsubscribe page without token shows Link not valid",
        "Description": "1. Open `/unsubscribe` with no query token.\n2. Read page copy.",
        "Suggestion / Expected Behaviour": "Shows 'Link not valid' (or equivalent) and does not crash.",
        "Role(s)": "Guest",
        "Preconditions": "None",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright IS-055",
    },
    {
        "ID": "TC-IS-07-022",
        "sheet": "07 Browse Save Apply",
        "Module / Section": "07 Browse Save Apply",
        "Feature": "Internship detail",
        "Type": "Regression",
        "Issue Summary": "Internship detail exposes Report listing control",
        "Description": (
            "1. Candidate session.\n"
            "2. Open a visible internship detail.\n"
            "3. Find Report button."
        ),
        "Suggestion / Expected Behaviour": "Report control is visible on detail page.",
        "Role(s)": "Candidate",
        "Preconditions": "At least one published internship visible to candidate",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright IS-061",
    },
    {
        "ID": "TC-IS-06-010",
        "sheet": "06 Candidate Profile",
        "Module / Section": "06 Candidate Profile",
        "Feature": "Profile draft",
        "Type": "Regression",
        "Issue Summary": "Candidate profile has Save draft control",
        "Description": "1. Candidate opens `/candidate/profile`.\n2. Locate Save draft control.",
        "Suggestion / Expected Behaviour": "Save draft (or Save draft & exit) button is visible.",
        "Role(s)": "Candidate",
        "Preconditions": "Core candidate",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright IS-062",
    },
    {
        "ID": "TC-IS-07-023",
        "sheet": "07 Browse Save Apply",
        "Module / Section": "07 Browse Save Apply",
        "Feature": "Browse filters",
        "Type": "Regression",
        "Issue Summary": "Browse filters include start date options",
        "Description": (
            "1. Candidate opens `/candidate/internships`.\n"
            "2. Open Filter drawer.\n"
            "3. Confirm Start date label and option e.g. Starts within 30 days."
        ),
        "Suggestion / Expected Behaviour": "Start date filter present in browse drawer.",
        "Role(s)": "Candidate",
        "Preconditions": "Core candidate",
        "Automation": "Automated",
        "Severity / Priority": "Medium",
        "Doc Status": "Ready for QA",
        "Phase": "industry QA sync",
        "Test Status": "Not Run",
        "Legacy ID": "",
        "Comments / Notes": "Playwright IS-064",
    },
]


def find_header(ws):
    for r in range(1, 12):
        vals = [ws.cell(r, c).value for c in range(1, min(ws.max_column, 40) + 1)]
        if vals and vals[0] in ("ID", "TC ID"):
            return r, {str(v): i + 1 for i, v in enumerate(vals) if v}
    return None, {}


def style_cell(cell, fill=None):
    cell.font = BODY
    cell.alignment = WRAP
    if fill is not None:
        cell.fill = fill


def upsert_row(ws, header_row, cols, rec, preserve_status=False):
    id_col = cols.get("ID") or cols.get("TC ID") or 1
    tc_id = rec["ID"]
    for r in range(header_row + 1, ws.max_row + 1):
        if str(ws.cell(r, id_col).value or "") == tc_id:
            for key, val in rec.items():
                if key == "sheet":
                    continue
                col = cols.get(key)
                if not col:
                    continue
                if preserve_status and key in ("Test Status", "Actual Result", "Date Verified"):
                    continue
                ws.cell(r, col).value = val
                style_cell(ws.cell(r, col))
            return "updated", r
    r = ws.max_row + 1
    for key in COLS:
        col = cols.get(key)
        if not col:
            continue
        ws.cell(r, col).value = rec.get(key)
        style_cell(ws.cell(r, col), NOTRUN if key == "Test Status" else None)
    return "added", r


def normalize_automation(value: str | None, tc_id: str) -> str:
    if tc_id in OBSOLETE_IDS:
        return "Obsolete"
    if tc_id in AUTOMATED_IDS:
        return "Automated"
    raw = (value or "").strip()
    if raw.startswith("Automated"):
        return "Automated"
    if raw.startswith("Obsolete"):
        return "Obsolete"
    return "Manual"


def main():
    wb = load_workbook(XLSX)
    stats = {"obsolete": 0, "edited": 0, "added": 0, "auto_norm": 0}

    # Index stamp
    if "Index" in wb.sheetnames:
        idx = wb["Index"]
        stamped = False
        for r in range(1, 40):
            a = idx.cell(r, 1).value
            if not a:
                continue
            s = str(a)
            if "as of" in s.lower() or "results" in s.lower() or "synced" in s.lower():
                idx.cell(r, 1).value = (
                    f"Results / sync as of {date.today().isoformat()} "
                    "(product hygiene + industry QA tiers)"
                )
                stamped = True
                break
        if not stamped:
            idx.cell(2, 1).value = (
                f"Results / sync as of {date.today().isoformat()} "
                "(product hygiene + industry QA tiers)"
            )

    sheets_by_title = {ws.title: ws for ws in wb.worksheets}

    # Walk all case sheets: obsolete + edit + normalize automation
    for ws in wb.worksheets:
        if ws.title in ("Index", "Coverage Matrix", "Coverage", "Notes", "How to use", "Meta"):
            continue
        hr, cols = find_header(ws)
        if not hr:
            continue
        id_col = cols.get("ID") or cols.get("TC ID")
        auto_col = cols.get("Automation")
        status_col = cols.get("Test Status")
        notes_col = cols.get("Comments / Notes")
        summary_col = cols.get("Issue Summary")
        for r in range(hr + 1, ws.max_row + 1):
            tid = str(ws.cell(r, id_col).value or "").strip()
            if not tid.startswith("TC-IS-"):
                continue

            if tid in OBSOLETE_IDS:
                if auto_col:
                    ws.cell(r, auto_col).value = "Obsolete"
                    style_cell(ws.cell(r, auto_col), OBSOLETE_FILL)
                if status_col:
                    ws.cell(r, status_col).value = "Obsolete"
                    style_cell(ws.cell(r, status_col), OBSOLETE_FILL)
                if notes_col:
                    prev = ws.cell(r, notes_col).value or ""
                    note = OBSOLETE_IDS[tid]
                    if note not in str(prev):
                        ws.cell(r, notes_col).value = f"{prev}\n{note}".strip()
                        style_cell(ws.cell(r, notes_col))
                if summary_col:
                    s = str(ws.cell(r, summary_col).value or "")
                    if not s.startswith("[Obsolete]"):
                        ws.cell(r, summary_col).value = f"[Obsolete] {s}"
                        style_cell(ws.cell(r, summary_col))
                stats["obsolete"] += 1
                continue

            if tid in EDITS:
                for key, val in EDITS[tid].items():
                    col = cols.get(key)
                    if col:
                        ws.cell(r, col).value = val
                        style_cell(ws.cell(r, col))
                stats["edited"] += 1

            if auto_col:
                old = ws.cell(r, auto_col).value
                new = normalize_automation(str(old) if old else None, tid)
                if str(old or "") != new:
                    ws.cell(r, auto_col).value = new
                    style_cell(ws.cell(r, auto_col))
                    stats["auto_norm"] += 1

            # Quarantine note for long legacy-only automation blurbs already normalized
            leg_col = cols.get("Legacy ID")
            if leg_col and notes_col:
                leg = str(ws.cell(r, leg_col).value or "").strip()
                if leg and leg.upper().startswith(("AUTH-", "REG-", "PUB-", "SA-", "CAND-", "EMP-", "PERM-")):
                    note = "Legacy ID retained for history; Playwright apply uses TC-IS-* only."
                    prev = str(ws.cell(r, notes_col).value or "")
                    if "Playwright apply uses TC-IS" not in prev:
                        ws.cell(r, notes_col).value = f"{prev}\n{note}".strip() if prev else note
                        style_cell(ws.cell(r, notes_col))

    # Add new cases
    for rec in NEW_CASES:
        sheet_name = rec["sheet"]
        ws = sheets_by_title.get(sheet_name)
        if not ws:
            print(f"WARN missing sheet {sheet_name}")
            continue
        hr, cols = find_header(ws)
        if not hr:
            print(f"WARN no header on {sheet_name}")
            continue
        # ensure columns exist for COLS keys used
        action, _ = upsert_row(ws, hr, cols, rec, preserve_status=False)
        if action == "added":
            stats["added"] += 1
        else:
            stats["edited"] += 1

    # Coverage Matrix nudge
    if "Coverage Matrix" in wb.sheetnames:
        cm = wb["Coverage Matrix"]
        cm.cell(1, 1).value = f"Coverage Matrix — synced {date.today().isoformat()} (Obsolete/Manual/Automated)"
        style_cell(cm.cell(1, 1))

    wb.save(XLSX)
    print(json_dumps(stats))


def json_dumps(obj):
    import json

    return json.dumps(obj, indent=2)


if __name__ == "__main__":
    main()
