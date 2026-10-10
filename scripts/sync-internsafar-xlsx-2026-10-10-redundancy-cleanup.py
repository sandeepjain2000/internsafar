# -*- coding: utf-8 -*-
"""
Workbook cleanup 2026-10-10: retire redundant / weak cases, tighten overlapping wording.

Every retired row is covered by a kept case (named in RETIRE below); the kept case's runner check
was strengthened in the same change so nothing valuable is lost. Kept rows that absorbed a retired
case say so in Comments / Notes. Overlapping rows get scope wording that points at the other case.

Also:
  - Recounts the Index sheet (Count / P0 / P1 / P2+ per sheet and TOTAL) and notes the cleanup in row 2.
  - Clears the stale Legacy ID EMP-I-8 on TC-IS-18-012 (now recorded by qa-test-account-cases.mjs).
  - Prunes retired ids and their legacy keys from test-cases/qa-results.json so apply does not
    report them as unmatched.

  python scripts/sync-internsafar-xlsx-2026-10-10-redundancy-cleanup.py           # preview only
  python scripts/sync-internsafar-xlsx-2026-10-10-redundancy-cleanup.py --apply   # writes workbook + json
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from internsafar_xlsx_cols import stamp_index_for_results  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / "test-cases" / "InternSafar-Test-Cases.xlsx"
RESULTS = ROOT / "test-cases" / "qa-results.json"
SKIP_SHEETS = {"Index", "Coverage Matrix"}
CLEANUP_TAG = "Cleanup 2026-10-10"

RETIRE = {
    "TC-IS-01-008": "weak (page loads only); /guidelines content covered by TC-IS-01-004 + Playwright IS-030",
    "TC-IS-02-002": "TC-IS-02-023 (wrong password and unknown email both show 'Invalid email or password')",
    "TC-IS-02-021": "TC-IS-14-014 (Bad Pass + Password Form success on the login report), TC-IS-02-023 (Inactive account + "
                    "Unknown account events), TC-IS-14-026 / TC-IS-14-027 (Employer suspended / Employer rejected events)",
    "TC-IS-03-019": "TC-IS-03-001 (same Google register round trip, manual)",
    "TC-IS-03-022": "TC-IS-03-002 (same non-Gmail register request → 400, no ip_users row created)",
    "TC-IS-04-009": "TC-IS-02-014 (/superadmin/login redirect signed out and signed in)",
    "TC-IS-08-004": "TC-IS-08-003 (reward points, active applications and profile score tiles + every shortcut route returns 200)",
    "TC-IS-11-008": "TC-IS-18-017 (remind → 200 and candidate gets the reminder notice)",
    "TC-IS-11-012": "TC-IS-11-018 (rating gate checked against the real application status) + TC-IS-11-013",
    "TC-IS-11-016": "TC-IS-11-001 (accept → offer accepted, application hired, employer notified)",
    "TC-IS-11-017": "TC-IS-11-002 (decline → offer declined, application declined_offer, employer notified)",
    "TC-IS-14-022": "TC-IS-18-028 (SuperAdmin sidebar rendered with no Notifications link)",
    "TC-IS-18-008": "TC-IS-18-051 (approval gate, exact 403 message, drafts too)",
    "TC-IS-18-009": "TC-IS-18-051 (profile-complete gate, exact 403 message, drafts too)",
    "TC-IS-18-014": "TC-IS-10-001 (full-page profile API, phone gate, notes, reminder, non-searchable 404) + TC-IS-09-020 "
                    "(page shows This application / Private notes / Timeline / Follow-up reminder); invites: TC-IS-18-015",
    "TC-IS-18-030": "TC-IS-02-024 (home email/password only + register Google start) and TC-IS-02-026",
    "TC-IS-18-031": "weak (only checked that the ip_users table exists)",
    "TC-IS-18-032": "TC-IS-02-022 (login), TC-IS-03-012 (employer register, Domain and Free-email), TC-IS-02-009 (forgot password), "
                    "TC-IS-01-009 (candidate register has no captcha)",
    "TC-IS-18-037": "TC-IS-18-033 (badge +1 on a new notice, back down after it is read)",
}

RETIRED_LEGACY = {
    "HELP-1", "AUTH-2", "AUTH-22", "PERM-9", "OFF-R-1", "RATE-2", "EMP-I-4", "EMP-I-5", "EMP-C-1",
    "REGX-1", "REGX-2", "REGX-3", "REG-E-1", "EMP-I-8",
}

ABSORBED = {
    "TC-IS-02-014": "TC-IS-04-009",
    "TC-IS-02-023": "TC-IS-02-002",
    "TC-IS-14-014": "TC-IS-02-021",
    "TC-IS-03-001": "TC-IS-03-019",
    "TC-IS-03-002": "TC-IS-03-022",
    "TC-IS-08-003": "TC-IS-08-004",
    "TC-IS-18-017": "TC-IS-11-008",
    "TC-IS-11-018": "TC-IS-11-012",
    "TC-IS-11-001": "TC-IS-11-016",
    "TC-IS-11-002": "TC-IS-11-017",
    "TC-IS-18-028": "TC-IS-14-022",
    "TC-IS-18-051": "TC-IS-18-008 and TC-IS-18-009",
    "TC-IS-10-001": "TC-IS-18-014",
    "TC-IS-02-024": "TC-IS-18-030",
    "TC-IS-02-022": "TC-IS-18-032 (login captcha)",
    "TC-IS-02-009": "TC-IS-18-032 (forgot-password captcha)",
    "TC-IS-18-033": "TC-IS-18-037",
    "TC-IS-03-012": "TC-IS-18-032 (employer register captcha, both paths)",
    "TC-IS-09-020": "TC-IS-18-014 (full-page notes / timeline / reminder sections)",
    "TC-IS-14-026": "TC-IS-02-021 (Employer suspended on the login report)",
    "TC-IS-14-027": "TC-IS-02-021 (Employer rejected on the login report)",
}

EDITS = {
    "TC-IS-02-014": {
        "Description": (
            "1. Signed out, open /superadmin/login and note the URL.\n"
            "2. Signed in as the test candidate, open /superadmin/login.\n"
            "3. Signed out, on `/` sign in as SuperAdmin (support@placementhub.online / <IP_QA_SUPERADMIN_PASSWORD>) + captcha.\n"
            "4. Confirm landing page and SuperAdmin nav."
        ),
        "Suggestion / Expected Behaviour": (
            "Step 1: replaces to `/` with the home sign-in form; no separate SuperAdmin form (#sa-email). "
            "Step 2: also replaces to `/` (the home page does not auto-route signed-in users) with no SuperAdmin form or links. "
            "Step 3–4: lands on /superadmin with SuperAdmin nav."
        ),
    },
    "TC-IS-02-023": {
        "Issue Summary": "Login matrix: wrong password / unknown email / pending / inactive / 2FA / role landing (candidate, employer, SuperAdmin)",
        "Suggestion / Expected Behaviour": (
            "Candidate → /candidate, employer → /employer, SuperAdmin → /superadmin. Wrong password and unknown email "
            "both show the same 'Invalid email or password' (email existence not revealed). Pending and inactive "
            "accounts cannot sign in. The login report (ip_login_events) records 'Inactive account' and 'Unknown account' "
            "for those attempts. 2FA user gets the OTP step; a wrong code is refused. Employer pending / "
            "suspended / rejected branches: TC-IS-02-028, TC-IS-02-029, TC-IS-14-026, TC-IS-14-027. Captcha: TC-IS-02-022."
        ),
    },
    "TC-IS-02-024": {
        "Issue Summary": "Home sign-in is email/password only; candidate register Sign up with Google reaches Google with matching redirect_uri",
    },
    "TC-IS-06-005": {
        "Issue Summary": "Academics API: candidate-only, saves rows, rejects bad year / CGPA",
        "Description": (
            "1. As the test candidate, GET /api/ip/candidate/academics.\n"
            "2. Repeat as employer, SuperAdmin and signed out.\n"
            "3. As the candidate, PUT the same rows back; then PUT a row with graduation year 1800, then a first row with CGPA 150.\n"
            "4. PUT as employer. GET again as the candidate."
        ),
        "Suggestion / Expected Behaviour": (
            "Candidate GET 200 with an items list (never 500). Employer 403, SuperAdmin 403, signed out 401. Same-rows PUT 200. "
            "Year 1800 → 400 'Enter a graduation year between 1950 and …'; CGPA 150 → 400 '…99.99 or less…'. Employer PUT 403. "
            "Rows are unchanged afterwards (bad requests save nothing). Academic tab UI: TC-IS-06-006."
        ),
    },
    "TC-IS-07-002": {
        "Description": (
            "1. On /candidate/internships open Filters (Show) and set search, min stipend, work mode, location, min match / validation, start date.\n"
            "2. Change sort."
        ),
        "Suggestion / Expected Behaviour": (
            "Results match GET /api/ip/candidate/internships for search, stipend, work mode, location, min match, start date and sort. "
            "Remote listings and filter restore are covered separately: TC-IS-07-014, TC-IS-16-001. Start-date option present: TC-IS-07-023."
        ),
    },
    "TC-IS-07-003": {
        "Issue Summary": "Browse empty state and ~390px mobile layout",
        "Suggestion / Expected Behaviour": (
            "Empty state explains no matches. At ~390px nothing clips horizontally; Filters toggle and saved views stay reachable. "
            "List/Cards toggle + persistence: TC-IS-07-017. Default tab: TC-IS-07-025."
        ),
    },
    "TC-IS-07-016": {
        "Description": (
            "1. GET /api/ip/candidate/internships with minMatch=0, 1 and 100.\n"
            "2. Inspect match_score on every returned item and on postings with no required skills."
        ),
        "Suggestion / Expected Behaviour": (
            "Every item at minMatch=1 has match_score ≥ 1; every item at minMatch=100 has match_score ≥ 100. "
            "Postings with no eligibility skills score 100 (advisory) and so pass any min match. No 500 on missing skills JSON. "
            "How the percent is computed: TC-IS-07-011."
        ),
    },
    "TC-IS-07-017": {
        "Suggestion / Expected Behaviour": (
            "Default view is List (table). Choice persists in localStorage key ip_browse_view. Filters/sort unchanged. "
            "Empty state + mobile: TC-IS-07-003."
        ),
    },
    "TC-IS-07-019": {
        "Suggestion / Expected Behaviour": (
            "Preset persists via /api/ip/list-presets and applies from the dropdown. Counter shows n/5 saved. "
            "Default-preset-wins-over-last-used on reload: TC-IS-16-002."
        ),
    },
    "TC-IS-07-020": {
        "Suggestion / Expected Behaviour": (
            "Shared ScoreInsightBar / MatchValidationPair on cards and list rows; browse items carry numeric 0–100 match and validation scores; "
            "bands High≥70, Med≥40, else Low. Not a hire guarantee copy on Validation. Match percent rule: TC-IS-07-011."
        ),
    },
    "TC-IS-07-025": {
        "Suggestion / Expected Behaviour": "Unapplied tab has aria-selected=true on a fresh session. List/Cards default + persistence: TC-IS-07-017.",
    },
    "TC-IS-08-003": {
        "Issue Summary": "Candidate home loads widgets and every shortcut opens a real page",
        "Description": (
            "1. Open /candidate after login and wait for the dashboard numbers.\n"
            "2. Read the shortcut links (browse, applications, offers, referral).\n"
            "3. Open each shortcut."
        ),
        "Suggestion / Expected Behaviour": (
            "Active-applications count renders as a number (no endless spinner). Reward points equals the profile API balance; "
            "Profile score shows a percentage. Shortcuts point to /candidate/internships, /candidate/applications, "
            "/candidate/offers, /candidate/referral and each returns 200."
        ),
    },
    "TC-IS-09-014": {
        "Suggestion / Expected Behaviour": (
            "Draft saves without spending points. Description, location, status and eligibility (skills, requirements text, "
            "ideal-candidate text) come back unchanged on re-open. Publish costs 50 pts when used."
        ),
    },
    "TC-IS-10-001": {
        "Issue Summary": "Employer candidate full-page profile: fields, phone and contact gating, notes, reminder, non-searchable 404",
        "Description": (
            "1. Open /employer/candidates and open a candidate who applied to this employer → /employer/candidates/{id}.\n"
            "2. Check discovery fields, email and phone visibility.\n"
            "3. Add a note (and try an empty note).\n"
            "4. Set a follow-up reminder.\n"
            "5. Open a candidate who is not searchable and never applied to this employer."
        ),
        "Suggestion / Expected Behaviour": (
            "GET /api/ip/employer/candidates/{id} 200 with the application; email shown (contact not gated). Phone hidden while "
            "hide_phone_until_shortlist is on and the application is before interviewing/offered/hired/completed. Note POST 201 and "
            "listed; empty note 400. Reminder POST 201 and listed. Step 5 → 404."
        ),
    },
    "TC-IS-11-002": {
        "Suggestion / Expected Behaviour": "Offer declined. Application status declined_offer. Employer gets an 'Offer declined' notification.",
    },
    "TC-IS-11-013": {
        "Issue Summary": "Stars range: 1 and 5 accepted, 0 and 6 rejected",
        "Description": (
            "1. Rate 0, 1, 5, 6 via POST /api/ip/ratings with internshipId on a hired/completed application.\n"
            "2. Rate with stars 5 and no internshipId."
        ),
        "Suggestion / Expected Behaviour": (
            "0 and 6 rejected. Missing internshipId rejected. 1 and 5 accepted on a hired/completed engagement (409 if that pair "
            "already rated that internship). Engagement gate (applied/shortlisted refused): TC-IS-11-018."
        ),
    },
    "TC-IS-11-018": {
        "Suggestion / Expected Behaviour": (
            "Steps 1–3: 400 (internshipId required, or no hired/completed engagement — judged by the application's real status). "
            "A not-yet-hired application of the test employer is always probed: rating it → 400 'only allowed after the candidate is hired…'. "
            "Step 4: 201, or 409 if already recorded for that internship. Star range: TC-IS-11-013."
        ),
    },
    "TC-IS-12-001": {
        "Suggestion / Expected Behaviour": "Shared threads. Candidate GET/POST message on an existing thread. Attachment requires a valid payload. Empty-body rule: TC-IS-12-006.",
    },
    "TC-IS-12-002": {
        "Issue Summary": "Archive API is role-specific and does not touch the other side's inbox",
        "Suggestion / Expected Behaviour": (
            "candidate_archived_at vs employer_archived_at. PATCH archived boolean required. SuperAdmin/candidate cannot set the employer "
            "archive column (403). Archive / Unarchive buttons in the UI: TC-IS-12-011."
        ),
    },
    "TC-IS-12-010": {
        "Suggestion / Expected Behaviour": "Formatted content posts via the existing messages API and appears in thread history. Empty-body rule: TC-IS-12-006.",
    },
    "TC-IS-12-011": {
        "Suggestion / Expected Behaviour": (
            "Threads move between All and Archived for this role only. Employer bulk button counts match the selection. "
            "The candidate inbox has per-thread Archive / Unarchive (no bulk bar). API column rules: TC-IS-12-002."
        ),
    },
    "TC-IS-14-014": {
        "Description": (
            "1. Fail a login with an unknown email and with the test candidate's email + wrong password.\n"
            "2. Sign in successfully.\n"
            "3. Open /superadmin/login-report; switch Candidates / Employers tabs.\n"
            "4. Failed only + search for the unknown email."
        ),
        "Suggestion / Expected Behaviour": (
            "Events include email, role, success, ip/user agent, failure_reason. Unknown email → 'Unknown account'; wrong password → "
            "'Password Form (Bad Pass)'; success → 'Password Form'. Role tabs show only that role. Failed-only search finds the "
            "unknown-email row with its reason."
        ),
    },
    "TC-IS-17-001": {
        "Issue Summary": "Candidate photo upload and bad file types",
        "Description": "1. Upload a small PNG/JPEG photo.\n2. Try a huge file and an .exe if the UI allows picking.",
        "Suggestion / Expected Behaviour": (
            "Photo: /api/ip/candidate/profile/photo/upload returns a URL. Dangerous/unsupported types fail with error JSON, not a 500 HTML page. "
            "Resume upload: TC-IS-17-005."
        ),
    },
    "TC-IS-18-017": {
        "Suggestion / Expected Behaviour": (
            "GET offers as employer lists the offer. POST /api/ip/offers/[id]/remind → 200 for an own pending offer and the candidate gets "
            "'Reminder: offer awaiting your response'; immediate repeat → 429; unknown offer → 404; candidate → 401/403."
        ),
    },
    "TC-IS-18-025": {
        "Description": "1. As the test employer, POST /api/ip/employer/internships with body `{`.\n2. Check the response.",
        "Suggestion / Expected Behaviour": "Internships POST with body `{` → 400 Invalid JSON, no stack trace. Applications route: TC-IS-07-013.",
    },
    "TC-IS-18-028": {
        "Suggestion / Expected Behaviour": "Rendered sidebar links match src/lib/ipNav.js for each role (no missing, no other-role links); mobile drawer opens. SuperAdmin has no Notifications link.",
    },
    "TC-IS-18-033": {
        "Suggestion / Expected Behaviour": "GET /api/ip/nav-badges goes up by one for a new unread notice and back down once it is read (PATCH /api/ip/notifications), without signing out.",
    },
    # Weak-check pass (same day): wording that did not match live behaviour.
    "TC-IS-13-004": {
        "Suggestion / Expected Behaviour": (
            "Each ledger row's running balance equals the sum of deltas up to that row, and the header balance equals the profile points. "
            "On accounts created through sign-up the balance equals the full ledger sum (includes sa_manual_credit / sa_manual_debit); "
            "seeded test accounts get their opening points outside the ledger, so they are not compared this way. "
            "Referral +25 is credited at registration for both candidate (Google) and employer referrals."
        ),
    },
    "TC-IS-18-027": {
        "Issue Summary": "When the override is on, the QA inbox gets a copy of temp passwords, OTPs and links",
        "Suggestion / Expected Behaviour": (
            "With the test-environment flag on and OUTBOUND_EMAIL_OVERRIDE set, candidate temp password, employer verify link, OTPs "
            "and reset mail go to the real recipient AND a copy goes to the override inbox in the same send (the real recipient is never dropped). "
            "With the flag off, mail goes to the real recipient only. Registration still succeeds if mail fails (warning shown)."
        ),
    },
}


# Expected text kept as-is; one scope sentence appended (idempotent).
APPEND_EXPECTED = {
    "TC-IS-09-001": "Scope: missing interview time → TC-IS-09-002; bad Meet URL → TC-IS-09-008.",
    "TC-IS-14-006": "Scope: login/posting blocks for suspended and rejected employers → TC-IS-14-026, TC-IS-14-027.",
    "TC-IS-03-002": "No ip_users row is created for the rejected email.",
    "TC-IS-03-012": "Wrong captcha is refused on both the Domain and Free-email paths.",
    "TC-IS-09-020": "The full page (opened with applicationId) shows This application, Private notes, Timeline and Follow-up reminder.",
    "TC-IS-14-026": "The login report records the blocked attempt as 'Employer suspended'.",
    "TC-IS-14-027": "The login report records the blocked attempt as 'Employer rejected'.",
    "TC-IS-05-003": "Changing one category leaves the other categories unchanged; an employer session is refused (403).",
    "TC-IS-13-002": "Every ledger row for these reasons carries exactly that amount, and profile_complete / first_application_bonus are never granted twice to one user.",
    "TC-IS-14-012": "A candidate session is refused the claims API (403).",
}


def find_header(ws):
    for r in range(1, 12):
        if str(ws.cell(r, 1).value or "").strip() in ("ID", "TC ID"):
            return r, {str(ws.cell(r, c).value or "").strip(): c for c in range(1, ws.max_column + 1)}
    return None, {}


def sev_bucket(v):
    s = str(v or "").strip()
    if s in ("P0", "Critical"):
        return "P0"
    if s in ("P1", "High"):
        return "P1"
    return "P2+"


def append_note(old, note):
    old = str(old or "").strip()
    if CLEANUP_TAG in old:
        return old
    return f"{old}\n{note}".strip()


def main(apply: bool) -> None:
    wb = load_workbook(XLSX)
    stats = Counter()
    seen_retired = set()
    seen_edit = set()

    for ws in wb.worksheets:
        if ws.title in SKIP_SHEETS:
            continue
        hr, cols = find_header(ws)
        if not hr:
            continue
        id_col = cols.get("ID") or cols.get("TC ID")
        for r in range(ws.max_row, hr, -1):
            tid = str(ws.cell(r, id_col).value or "").strip()
            if tid in RETIRE:
                ws.delete_rows(r)
                seen_retired.add(tid)
                stats["retired"] += 1

        notes_col = cols.get("Comments / Notes")
        legacy_col = cols.get("Legacy ID")
        for r in range(hr + 1, ws.max_row + 1):
            tid = str(ws.cell(r, id_col).value or "").strip()
            if not tid.startswith("TC-IS-"):
                continue
            for key, val in EDITS.get(tid, {}).items():
                c = cols.get(key)
                if c and ws.cell(r, c).value != val:
                    ws.cell(r, c).value = val
                    stats["fields_rewritten"] += 1
                    seen_edit.add(tid)
            exp_col = cols.get("Suggestion / Expected Behaviour")
            if tid in APPEND_EXPECTED and exp_col:
                cur = str(ws.cell(r, exp_col).value or "").strip()
                if APPEND_EXPECTED[tid] not in cur:
                    ws.cell(r, exp_col).value = f"{cur} {APPEND_EXPECTED[tid]}".strip()
                    stats["fields_rewritten"] += 1
                seen_edit.add(tid)
            if tid in ABSORBED and notes_col:
                note = f"{CLEANUP_TAG}: also covers retired {ABSORBED[tid]}."
                nv = append_note(ws.cell(r, notes_col).value, note)
                if nv != ws.cell(r, notes_col).value:
                    ws.cell(r, notes_col).value = nv
                    stats["absorbed_notes"] += 1
            if tid == "TC-IS-18-012" and legacy_col and ws.cell(r, legacy_col).value == "EMP-I-8":
                ws.cell(r, legacy_col).value = None
                stats["legacy_cleared"] += 1

    total = Counter()
    sheets = {ws.title: ws for ws in wb.worksheets}
    if "Index" in wb.sheetnames:
        idx = wb["Index"]
        for r in range(5, 24):
            name = idx.cell(r, 2).value
            if name not in sheets or name in SKIP_SHEETS:
                continue
            ws = sheets[name]
            hr, cols = find_header(ws)
            id_col = cols.get("ID") or cols.get("TC ID")
            cnt = Counter()
            for rr in range(hr + 1, ws.max_row + 1):
                if str(ws.cell(rr, id_col).value or "").startswith("TC-IS-"):
                    cnt["n"] += 1
                    cnt[sev_bucket(ws.cell(rr, cols["Severity / Priority"]).value)] += 1
            idx.cell(r, 3).value = str(cnt["n"])
            idx.cell(r, 4).value = str(cnt["P0"])
            idx.cell(r, 5).value = str(cnt["P1"])
            idx.cell(r, 6).value = str(cnt["P2+"])
            total.update(cnt)
        idx.cell(24, 3).value = str(total["n"])
        idx.cell(24, 4).value = str(total["P0"])
        idx.cell(24, 5).value = str(total["P1"])
        idx.cell(24, 6).value = str(total["P2+"])
        desc = str(idx.cell(2, 1).value or "")
        if CLEANUP_TAG not in desc:
            idx.cell(2, 1).value = (
                f"{desc} {CLEANUP_TAG}: retired {len(RETIRE)} redundant/weak cases (each covered by a kept, strengthened case) "
                "and tightened overlapping wording."
            ).strip()
        stamp_index_for_results(wb)

    missing_retired = sorted(set(RETIRE) - seen_retired)
    missing_edit = sorted((set(EDITS) | set(APPEND_EXPECTED)) - seen_edit)

    pruned = 0
    if RESULTS.exists():
        data = json.loads(RESULTS.read_text(encoding="utf-8"))
        drop = set(RETIRE) | RETIRED_LEGACY
        for bucket in ("cases", "byTcId"):
            store = data.get(bucket)
            if isinstance(store, dict):
                for k in list(store):
                    if k in drop:
                        del store[k]
                        pruned += 1
        if apply:
            RESULTS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({**stats, "workbook_total_after": total["n"], "qa_results_pruned": pruned}, indent=2))
    if missing_retired:
        print(f"Not found (already retired?): {missing_retired}")
    if missing_edit:
        print(f"No field change needed (already applied?): {missing_edit}")
    if apply:
        wb.save(XLSX)
        print(f"Saved {XLSX.name} and {RESULTS.name}")
    else:
        print("Preview only — re-run with --apply to write.")


if __name__ == "__main__":
    main("--apply" in sys.argv)
