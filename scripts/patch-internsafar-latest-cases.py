# -*- coding: utf-8 -*-
"""
Patch InternSafar-Test-Cases.xlsx for current internship-portal:
- Fix stale Google OAuth assumptions (home now has real Sign in with Google)
- Add latest-update / regression TC-IS rows (help chat, ops alerts, migration safety)

Does not create a second workbook. Run:
  python scripts/patch-internsafar-latest-cases.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from lib.internsafar_xlsx_cols import COLS

XLSX = ROOT / "test-cases" / "InternSafar-Test-Cases.xlsx"

BODY = Font(name="Calibri", size=11)
NOTRUN = PatternFill("solid", fgColor="FFF2CC")
WRAP = Alignment(vertical="top", wrap_text=True)

PRESERVE = ("Test Status", "Actual Result", "Date Verified")


def find_header(ws):
    for r in range(1, 12):
        vals = [ws.cell(r, c).value for c in range(1, min(ws.max_column, 30) + 1)]
        if vals and vals[0] in ("ID", "TC ID") and ("Issue Summary" in vals or "Title" in vals):
            return r, {str(v): i + 1 for i, v in enumerate(vals) if v}
    return None, {}


def upsert_row(ws, header_row: int, cols: dict, rec: dict):
    tc_id = rec["ID"]
    id_col = cols.get("ID") or cols.get("TC ID") or 1
    for r in range(header_row + 1, ws.max_row + 1):
        if ws.cell(r, id_col).value == tc_id:
            for key in COLS:
                col = cols.get(key)
                if not col:
                    continue
                val = rec.get(key)
                if key in PRESERVE and ws.cell(r, col).value:
                    continue
                if key not in PRESERVE:
                    ws.cell(r, col).value = val
                    ws.cell(r, col).font = BODY
                    ws.cell(r, col).alignment = WRAP
            return "updated"
    r = ws.max_row + 1
    for key in COLS:
        col = cols.get(key)
        if not col:
            continue
        ws.cell(r, col).value = rec.get(key)
        ws.cell(r, col).font = BODY
        ws.cell(r, col).alignment = WRAP
        if key == "Test Status":
            ws.cell(r, col).fill = NOTRUN
    return "added"


def case(
    tid,
    module,
    feature,
    summary,
    typ,
    roles,
    pre,
    desc,
    expected,
    notes,
    automation,
    legacy,
    sev="High",
):
    return {
        "ID": tid,
        "Module / Section": module,
        "Type": typ,
        "Issue Summary": summary,
        "Description": desc,
        "Suggestion / Expected Behaviour": expected,
        "Reference": automation,
        "Doc Status": "Ready for QA",
        "Severity / Priority": sev,
        "Test Status": "Not Run",
        "Date Verified": None,
        "Comments / Notes": notes,
        "Dev comment": None,
        "Requirement": None,
        "Phase": "InternSafar Latest Update",
        "Estimate Hr": None,
        "Role(s)": roles,
        "Preconditions": pre,
        "Actual Result": None,
        "Automation": automation,
        "Feature": feature,
        "Legacy ID": legacy,
    }


NEW_CASES = [
    case(
        "TC-IS-02-024",
        "02 Auth & Access",
        "Google OAuth register verify",
        "Candidate register Sign up with Google reaches accounts.google.com with matching redirect_uri",
        "Regression",
        "Guest",
        "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configured for this host",
        "1. Open `/register/candidate` signed out.\n2. Click Sign up with Google (button.ip-crg-google-btn).\n3. Stop on Google accounts URL; inspect client_id and redirect_uri.",
        "Browser reaches accounts.google.com. redirect_uri is `{origin}/api/auth/callback/google` matching the app origin. Home `/` has no Google login button.",
        "Completing Google consent is optional. Playwright: qa/tests/google-auth.spec.js",
        "Automated (google-auth + QA remaining suite)",
        "AUTH-GOOGLE-1",
    ),
    case(
        "TC-IS-02-025",
        "02 Auth & Access",
        "Google OAuth errors",
        "GoogleLoginDisabled / GoogleAccountNotLinked show friendly message",
        "Negative",
        "Guest",
        "None",
        "1. Open `/?error=GoogleLoginDisabled` and `/?error=GoogleAccountNotLinked`.\n2. Read the banner/message.",
        "Friendly copy that Google sign-in is not available — use email/password (or Forgot password). Not a raw NextAuth dump.",
        "Playwright google-auth.spec.js / regression.spec.js",
        "Automated",
        "AUTH-GOOGLE-2",
    ),
    case(
        "TC-IS-02-026",
        "02 Auth & Access",
        "Dual auth paths",
        "Credentials login still works when Google provider is configured",
        "Regression",
        "Candidate",
        "Google env present; core candidate seeded",
        "1. With Google configured, sign in on `/` with core candidate email/password + captcha.\n2. Confirm landing on /candidate without requiring Google consent.",
        "Password path remains independent of Google OAuth start.",
        "Demo candidate from qa helpers",
        "Automated (auth / QA)",
        "AUTH-GOOGLE-3",
    ),
    case(
        "TC-IS-18-039",
        "18 Cross-cutting",
        "Help chatbot",
        "Help launcher opens panel with InternSafar Help title",
        "Functional",
        "Guest",
        "App loads HelpChatbot (Providers)",
        "1. Open `/`.\n2. Click .ip-helpbot__launcher.\n3. Confirm panel title.",
        "Panel opens; title contains InternSafar Help.",
        "regression.spec.js IS-011",
        "Automated",
        "HELP-CHAT-1",
    ),
    case(
        "TC-IS-18-040",
        "18 Cross-cutting",
        "Help chatbot",
        "GET /api/ip/help-chat reports NVIDIA configuration",
        "Functional",
        "Guest",
        "None",
        "1. GET `/api/ip/help-chat`.\n2. Read JSON.",
        "`ok: true` and boolean `configured` (true when keys/env present).",
        "regression.spec.js IS-012",
        "Automated",
        "HELP-CHAT-2",
    ),
    case(
        "TC-IS-18-041",
        "18 Cross-cutting",
        "Help chatbot",
        "Empty help message is rejected",
        "Negative",
        "Guest",
        "None",
        "1. POST `/api/ip/help-chat` with whitespace message.\n2. Confirm UI empty submit does not create a user bubble.",
        "API 400 Please enter a help question. UI does not send empty.",
        "regression.spec.js IS-039",
        "Automated",
        "HELP-CHAT-3",
        "Medium",
    ),
    case(
        "TC-IS-18-042",
        "18 Cross-cutting",
        "Ops alerts",
        "ops/report-error accepts unexpected client error payload",
        "Functional",
        "System",
        "Mail may be overridden in QA; do not spam prod inbox",
        "1. POST `/api/ip/ops/report-error` with empty body → 400.\n2. POST with message + kind UNEXPECTED_CLIENT → ok.",
        "Validation 400; valid payload ok:true (sent or cooldown).",
        "regression.spec.js IS-018/020",
        "Automated",
        "OPS-1",
    ),
    case(
        "TC-IS-18-043",
        "18 Cross-cutting",
        "Ops alerts",
        "ops/report-error ignores ResizeObserver noise",
        "Edge",
        "System",
        "None",
        "1. POST report-error with ResizeObserver loop message.",
        "ok:true ignored:true",
        "regression.spec.js IS-019",
        "Automated",
        "OPS-2",
        "Medium",
    ),
    case(
        "TC-IS-18-044",
        "18 Cross-cutting",
        "Ops alerts",
        "ops/report-error cooldown on duplicate",
        "Regression",
        "System",
        "None",
        "1. POST same synthetic error twice within cooldown window.",
        "Both ok; second indicates cooldown / not re-sent.",
        "regression.spec.js IS-040",
        "Automated",
        "OPS-3",
        "Medium",
    ),
    case(
        "TC-IS-18-045",
        "18 Cross-cutting",
        "Database migrations",
        "Migration SQL safety scan passes (no wipe patterns on new files)",
        "Regression",
        "DevOps",
        "Repo checkout",
        "1. Run `npm run db:check-migration-safety`.",
        "Exit 0. Non-allowlisted migrations have no DELETE FROM / DROP TABLE / TRUNCATE wipe patterns.",
        "scripts/assert-migration-sql-safe.js; regression.spec.js IS-022",
        "Automated",
        "DB-SAFE-1",
    ),
    case(
        "TC-IS-18-046",
        "18 Cross-cutting",
        "Help chatbot",
        "Help reset restores welcome and starters",
        "Regression",
        "Guest",
        "Help panel open",
        "1. Open help panel.\n2. Click reset.\n3. Confirm welcome + starters.",
        "Conversation reset; starters visible again.",
        "regression.spec.js IS-017",
        "Automated",
        "HELP-CHAT-4",
        "Medium",
    ),
    case(
        "TC-IS-02-027",
        "02 Auth & Access",
        "Google linked login",
        "Linked Google account Sign in with Google opens a portal session",
        "Functional",
        "Candidate, Employer",
        "GOOGLE_* configured; account previously registered via Google so ip_google_identities is linked",
        "1. Use a candidate/employer that completed Google registration (row in ip_google_identities).\n"
        "2. Signed out on `/`, click Sign in with Google; complete consent with that same Google account.\n"
        "3. Confirm landing on role home (/candidate or /employer) with an active session.",
        "Without a registration intent cookie, findLinkedUserForGoogleLogin succeeds and creates a portal session. "
        "Not GoogleLoginDisabled. Unlinked accounts follow TC-IS-03-021 / TC-IS-02-025.",
        "Added 2026-09-15. Automated start/unlinked: TC-IS-02-024/025.",
        "Manual",
        "AUTH-GOOGLE-LINKED-1",
    ),
]


def patch_regx1(ws, cols: dict):
    id_col = cols.get("ID") or cols.get("TC ID")
    if not id_col:
        return False
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, id_col).value != "TC-IS-18-030":
            continue
        mapping = {
            "Issue Summary": "Register exposes Google verify; home login is email/password only",
            "Description": (
                "1. Open `/` — confirm email/password fields and that Sign in with Google is absent.\n"
                "2. Open /register/candidate — click Sign up with Google; confirm accounts.google.com "
                "with matching redirect_uri.\n"
                "3. Return; sign in with email/password + captcha — lands on role home."
            ),
            "Suggestion / Expected Behaviour": (
                "GoogleProvider is enabled when secrets exist. Home login never uses Google. "
                "Register uses google-intent → verify token. Credentials login remains independent. "
                "Bare Google callback without intent → GoogleLoginDisabled."
            ),
            "Comments / Notes": (
                "Aligned 2026-09-23: home Google login removed. "
                "See TC-IS-02-024..026. Automation: google-auth.spec.js + QA."
            ),
            "Automation": "Automated (partial) + Manual consent",
            "Reference": "Automated (partial) + Manual consent",
        }
        for key, val in mapping.items():
            col = cols.get(key)
            if col:
                ws.cell(r, col).value = val
                ws.cell(r, col).font = BODY
                ws.cell(r, col).alignment = WRAP
        return True
    return False


def patch_stale_google_register(ws, cols: dict):
    """Keep TC-IS-03-021 aligned if workbook is re-patched later."""
    id_col = cols.get("ID") or cols.get("TC ID")
    if not id_col:
        return False
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, id_col).value != "TC-IS-03-021":
            continue
        mapping = {
            "Issue Summary": (
                "Home Google sign-in without register intent: unlinked account -> GoogleAccountNotLinked"
            ),
            "Description": (
                "1. Signed out on `/` (no call to /api/ip/auth/google-intent).\n"
                "2. Click Sign in with Google; complete consent with a Google account that has never "
                "registered / is not in ip_google_identities.\n"
                "3. Observe landing URL, friendly error, and session (must remain signed out)."
            ),
            "Suggestion / Expected Behaviour": (
                "Redirect to /?error=GoogleAccountNotLinked (not GoogleLoginDisabled). "
                "Friendly copy about no linked account / register with Google first. "
                "No portal session. Login report may record failure about account not linked."
            ),
            "Comments / Notes": (
                "Rewritten 2026-09-15 with product. Companion success: TC-IS-02-027."
            ),
        }
        for key, val in mapping.items():
            col = cols.get(key)
            if col:
                ws.cell(r, col).value = val
                ws.cell(r, col).font = BODY
                ws.cell(r, col).alignment = WRAP
        return True
    return False


def main():
    if not XLSX.exists():
        raise SystemExit(f"Missing {XLSX}")
    wb = load_workbook(XLSX)
    summary = {"updated": [], "added": [], "regx1": False, "google021": False}

    auth = wb["02 Auth & Access"]
    cross = wb["18 Cross-cutting"]
    reg = wb["03 Registration"]
    hr_auth, cols_auth = find_header(auth)
    hr_cross, cols_cross = find_header(cross)
    hr_reg, cols_reg = find_header(reg)
    if not hr_auth or not hr_cross:
        raise SystemExit("Header row not found — run migrate-internsafar-xlsx-boarders-cols.py first")

    summary["regx1"] = patch_regx1(cross, cols_cross)
    if hr_reg:
        summary["google021"] = patch_stale_google_register(reg, cols_reg)

    for rec in NEW_CASES:
        ws = auth if str(rec["Module / Section"]).startswith("02") else cross
        hr, cols = (hr_auth, cols_auth) if ws is auth else (hr_cross, cols_cross)
        action = upsert_row(ws, hr, cols, rec)
        summary[action if action == "added" else "updated"].append(rec["ID"])

    wb.save(XLSX)
    print(f"Patched {XLSX}")
    print(summary)


if __name__ == "__main__":
    main()
