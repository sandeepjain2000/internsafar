# -*- coding: utf-8 -*-
"""
Patch InternSafar-Test-Cases.xlsx for current internship-portal:
- Fix stale Google OAuth assumptions (home now has real Sign in with Google)
- Add latest-update / regression TC-IS rows (help chat, ops alerts, migration safety)

Does not create a second workbook. Run:
  python scripts/patch-internsafar-latest-cases.py
"""
from __future__ import annotations

from pathlib import Path

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "test-cases" / "InternSafar-Test-Cases.xlsx"

BODY = Font(name="Calibri", size=11)
NOTRUN = PatternFill("solid", fgColor="FFF2CC")
WRAP = Alignment(vertical="top", wrap_text=True)

# Column order matches gen-internsafar-test-cases-xlsx.py
COLS = [
    "TC ID",
    "Module",
    "Feature",
    "Title",
    "Priority",
    "Type",
    "Role(s)",
    "Preconditions",
    "Test Steps",
    "Expected Result",
    "Test Data / Notes",
    "Automation",
    "Status",
    "Actual Result",
    "Executed At",
    "Legacy ID",
]


def find_header(ws):
    for r in range(1, 10):
        vals = [ws.cell(r, c).value for c in range(1, 20)]
        if vals and vals[0] == "TC ID":
            return r
    return None


def row_values(rec: dict):
    return [rec.get(c) for c in COLS]


def upsert_row(ws, header_row: int, rec: dict):
    tc_id = rec["TC ID"]
    for r in range(header_row + 1, ws.max_row + 1):
        if ws.cell(r, 1).value == tc_id:
            for c, key in enumerate(COLS, 1):
                val = rec.get(key)
                if key in ("Status", "Actual Result", "Executed At") and ws.cell(r, c).value:
                    # Keep prior run results unless Status is empty
                    if key == "Status" and not ws.cell(r, c).value:
                        ws.cell(r, c).value = val
                    elif key != "Status":
                        continue
                    else:
                        continue
                if key not in ("Status", "Actual Result", "Executed At"):
                    ws.cell(r, c).value = val
                    ws.cell(r, c).font = BODY
                    ws.cell(r, c).alignment = WRAP
            return "updated"
    # append
    r = ws.max_row + 1
    for c, key in enumerate(COLS, 1):
        ws.cell(r, c).value = rec.get(key)
        ws.cell(r, c).font = BODY
        ws.cell(r, c).alignment = WRAP
        if key == "Status":
            ws.cell(r, c).fill = NOTRUN
    return "added"


NEW_CASES = [
    {
        "TC ID": "TC-IS-02-024",
        "Module": "02 Auth & Access",
        "Feature": "Google OAuth login",
        "Title": "Home Sign in with Google reaches accounts.google.com with matching redirect_uri",
        "Priority": "High",
        "Type": "Regression",
        "Role(s)": "Guest",
        "Preconditions": "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configured for this host",
        "Test Steps": (
            "1. Open `/` signed out.\n"
            "2. Click Sign in with Google (button.ip-gemini-google-btn).\n"
            "3. Stop on Google accounts URL; inspect client_id and redirect_uri."
        ),
        "Expected Result": (
            "Browser reaches accounts.google.com. "
            "redirect_uri is `{origin}/api/auth/callback/google` matching the app origin."
        ),
        "Test Data / Notes": "Completing Google consent is optional. Playwright: qa/tests/google-auth.spec.js",
        "Automation": "Automated (google-auth + QA remaining suite)",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "AUTH-GOOGLE-1",
    },
    {
        "TC ID": "TC-IS-02-025",
        "Module": "02 Auth & Access",
        "Feature": "Google OAuth errors",
        "Title": "GoogleAccountNotLinked shows friendly message",
        "Priority": "High",
        "Type": "Negative",
        "Role(s)": "Guest",
        "Preconditions": "None",
        "Test Steps": "1. Open `/?error=GoogleAccountNotLinked`.\n2. Read the banner/message.",
        "Expected Result": "Friendly copy about no linked account / sign up with Google — not a raw NextAuth dump.",
        "Test Data / Notes": "Playwright google-auth.spec.js / regression.spec.js",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "AUTH-GOOGLE-2",
    },
    {
        "TC ID": "TC-IS-02-026",
        "Module": "02 Auth & Access",
        "Feature": "Dual auth paths",
        "Title": "Credentials login still works when Google provider is configured",
        "Priority": "High",
        "Type": "Regression",
        "Role(s)": "Candidate",
        "Preconditions": "Google env present; core candidate seeded",
        "Test Steps": (
            "1. With Google configured, sign in on `/` with core candidate email/password + captcha.\n"
            "2. Confirm landing on /candidate without requiring Google consent."
        ),
        "Expected Result": "Password path remains independent of Google OAuth start.",
        "Test Data / Notes": "Demo candidate from qa helpers",
        "Automation": "Automated (auth / QA)",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "AUTH-GOOGLE-3",
    },
    {
        "TC ID": "TC-IS-18-039",
        "Module": "18 Cross-cutting",
        "Feature": "Help chatbot",
        "Title": "Help launcher opens panel with InternSafar Help title",
        "Priority": "High",
        "Type": "Functional",
        "Role(s)": "Guest",
        "Preconditions": "App loads HelpChatbot (Providers)",
        "Test Steps": "1. Open `/`.\n2. Click .ip-helpbot__launcher.\n3. Confirm panel title.",
        "Expected Result": "Panel opens; title contains InternSafar Help.",
        "Test Data / Notes": "regression.spec.js IS-011",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "HELP-CHAT-1",
    },
    {
        "TC ID": "TC-IS-18-040",
        "Module": "18 Cross-cutting",
        "Feature": "Help chatbot",
        "Title": "GET /api/ip/help-chat reports NVIDIA configuration",
        "Priority": "High",
        "Type": "Functional",
        "Role(s)": "Guest",
        "Preconditions": "None",
        "Test Steps": "1. GET `/api/ip/help-chat`.\n2. Read JSON.",
        "Expected Result": "`ok: true` and boolean `configured` (true when keys/env present).",
        "Test Data / Notes": "regression.spec.js IS-012",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "HELP-CHAT-2",
    },
    {
        "TC ID": "TC-IS-18-041",
        "Module": "18 Cross-cutting",
        "Feature": "Help chatbot",
        "Title": "Empty help message is rejected",
        "Priority": "Medium",
        "Type": "Negative",
        "Role(s)": "Guest",
        "Preconditions": "None",
        "Test Steps": "1. POST `/api/ip/help-chat` with whitespace message.\n2. Confirm UI empty submit does not create a user bubble.",
        "Expected Result": "API 400 Please enter a help question. UI does not send empty.",
        "Test Data / Notes": "regression.spec.js IS-039",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "HELP-CHAT-3",
    },
    {
        "TC ID": "TC-IS-18-042",
        "Module": "18 Cross-cutting",
        "Feature": "Ops alerts",
        "Title": "ops/report-error accepts unexpected client error payload",
        "Priority": "High",
        "Type": "Functional",
        "Role(s)": "System",
        "Preconditions": "Mail may be overridden in QA; do not spam prod inbox",
        "Test Steps": (
            "1. POST `/api/ip/ops/report-error` with empty body → 400.\n"
            "2. POST with message + kind UNEXPECTED_CLIENT → ok."
        ),
        "Expected Result": "Validation 400; valid payload ok:true (sent or cooldown).",
        "Test Data / Notes": "regression.spec.js IS-018/020",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "OPS-1",
    },
    {
        "TC ID": "TC-IS-18-043",
        "Module": "18 Cross-cutting",
        "Feature": "Ops alerts",
        "Title": "ops/report-error ignores ResizeObserver noise",
        "Priority": "Medium",
        "Type": "Edge",
        "Role(s)": "System",
        "Preconditions": "None",
        "Test Steps": "1. POST report-error with ResizeObserver loop message.",
        "Expected Result": "ok:true ignored:true",
        "Test Data / Notes": "regression.spec.js IS-019",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "OPS-2",
    },
    {
        "TC ID": "TC-IS-18-044",
        "Module": "18 Cross-cutting",
        "Feature": "Ops alerts",
        "Title": "ops/report-error cooldown on duplicate",
        "Priority": "Medium",
        "Type": "Regression",
        "Role(s)": "System",
        "Preconditions": "None",
        "Test Steps": "1. POST same synthetic error twice within cooldown window.",
        "Expected Result": "Both ok; second indicates cooldown / not re-sent.",
        "Test Data / Notes": "regression.spec.js IS-040",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "OPS-3",
    },
    {
        "TC ID": "TC-IS-18-045",
        "Module": "18 Cross-cutting",
        "Feature": "Database migrations",
        "Title": "Migration SQL safety scan passes (no wipe patterns on new files)",
        "Priority": "High",
        "Type": "Regression",
        "Role(s)": "DevOps",
        "Preconditions": "Repo checkout",
        "Test Steps": "1. Run `npm run db:check-migration-safety`.",
        "Expected Result": "Exit 0. Non-allowlisted migrations have no DELETE FROM / DROP TABLE / TRUNCATE wipe patterns.",
        "Test Data / Notes": "scripts/assert-migration-sql-safe.js; regression.spec.js IS-022",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "DB-SAFE-1",
    },
    {
        "TC ID": "TC-IS-18-046",
        "Module": "18 Cross-cutting",
        "Feature": "Help chatbot",
        "Title": "Help reset restores welcome and starters",
        "Priority": "Medium",
        "Type": "Regression",
        "Role(s)": "Guest",
        "Preconditions": "Help panel open",
        "Test Steps": "1. Open help panel.\n2. Click reset.\n3. Confirm welcome + starters.",
        "Expected Result": "Conversation reset; starters visible again.",
        "Test Data / Notes": "regression.spec.js IS-017",
        "Automation": "Automated",
        "Status": "Not Run",
        "Actual Result": None,
        "Executed At": None,
        "Legacy ID": "HELP-CHAT-4",
    },
]


def patch_regx1(ws, header_row: int):
    for r in range(header_row + 1, ws.max_row + 1):
        if ws.cell(r, 1).value != "TC-IS-18-030":
            continue
        # Title, steps, expected, notes, automation, legacy stay REGX-1
        ws.cell(r, 4).value = (
            "Home and register expose real Google OAuth; password login still works"
        )
        ws.cell(r, 9).value = (
            "1. Open `/` — confirm Sign in with Google is present when GOOGLE_* is configured.\n"
            "2. Click it and confirm redirect to accounts.google.com with matching redirect_uri.\n"
            "3. Return; sign in with email/password + captcha — lands on role home.\n"
            "4. Open /register/candidate — Google control still present."
        )
        ws.cell(r, 10).value = (
            "GoogleProvider is enabled when secrets exist. Credentials login remains independent. "
            "Supersedes obsolete 'home has no Google button / GoogleLoginDisabled-only' assumption."
        )
        ws.cell(r, 11).value = (
            "Correction vs older checklist: home Google login is in product. "
            "See TC-IS-02-024..026. Automation: google-auth.spec.js + QA."
        )
        ws.cell(r, 12).value = "Automated (partial) + Manual consent"
        for c in (4, 9, 10, 11, 12):
            ws.cell(r, c).font = BODY
            ws.cell(r, c).alignment = WRAP
        return True
    return False


def main():
    if not XLSX.exists():
        raise SystemExit(f"Missing {XLSX}")
    wb = load_workbook(XLSX)
    summary = {"updated": [], "added": [], "regx1": False}

    auth = wb["02 Auth & Access"]
    cross = wb["18 Cross-cutting"]
    hr_auth = find_header(auth)
    hr_cross = find_header(cross)
    if not hr_auth or not hr_cross:
        raise SystemExit("Header row not found")

    summary["regx1"] = patch_regx1(cross, hr_cross)

    for rec in NEW_CASES:
        ws = auth if rec["Module"].startswith("02") else cross
        hr = hr_auth if ws is auth else hr_cross
        action = upsert_row(ws, hr, rec)
        summary[action if action == "added" else "updated"].append(rec["TC ID"])

    wb.save(XLSX)
    print(f"Patched {XLSX}")
    print(summary)


if __name__ == "__main__":
    main()
