# Excel ↔ live product audit (Phase 0)

**Date:** 2026-09-24  
**Workbook:** `test-cases/InternSafar-Test-Cases.xlsx` (~243 `TC-IS-*`)  
**Compared to:** sibling `internship-portal` `src/` + `qa/tests/`

## Summary

| Triage | Count (approx) | Action in Phase 1 |
|--------|----------------|-------------------|
| Keep | majority | Normalize Automation to Manual / Automated |
| Edit | ~5 Google/home rows | Fix title/steps to match live |
| Obsolete | 2 | Home Google portal-session paths removed |
| Add | 8 | P1/P2 + journey gaps |

## Obsolete (removed / unreachable features)

| ID | Reason |
|----|--------|
| TC-IS-02-027 | Home “Sign in with Google opens portal session” — Google login on `/` is disabled |
| TC-IS-03-021 | Home Google without register intent → NotLinked — home has no Google control; covered by `GoogleLoginDisabled` |

## Edit (stale wording)

| ID | Change |
|----|--------|
| TC-IS-02-024 | Title still says “Home Sign in with Google…”; live = **register** Sign up with Google OAuth (patch script already has correct text — re-apply) |
| TC-IS-02-025 | Broaden title to cover both GoogleLoginDisabled + GoogleAccountNotLinked |
| TC-IS-18-030 | Must say: home = email/password only; register = Google; password still works |
| Automation column | ~156 rows say long “Manual (sibling has scripts…)” — normalize to `Manual` / `Automated` / `Obsolete` |
| Patch script header | Still claims “home now has real Sign in with Google” — fix comment |

## Add (shipped product, missing Excel)

| New ID | Topic | Automation target |
|--------|-------|-------------------|
| TC-IS-09-015 | Employer profile required fields show `*` | Journey employer |
| TC-IS-14-023 | SA posting status unchanged → skip notify/email | Journey SA (API) |
| TC-IS-09-016 | Posting locations State + City fields | Manual (UI) |
| TC-IS-18-047 | `/unsubscribe` missing token → Link not valid | Automated (IS-055) |
| TC-IS-07-022 | Internship detail Report control | Automated (IS-061) |
| TC-IS-06-010 | Candidate profile Save draft | Automated (IS-062) |
| TC-IS-09-017 | Employer dashboard Action center | Automated (IS-063) |
| TC-IS-07-023 | Browse filters include start date | Automated (IS-064) |

## Playwright mapping note

`TITLE_TO_TC` covers a minority of rows. Unmatched Legacy IDs (AUTH-*, REG-C-*, etc.) are not failures — quarantine in Comments; do not expect apply-xlsx to touch them.

## Industry tiers (post Phase 2–3)

| Tier | Command | Scope |
|------|---------|-------|
| Smoke | `qa:e2e:smoke` | auth + google |
| Regression | `qa:e2e:regression` | smoke-latest + journeys + screens + mobile + Excel apply |
| Full | `qa:e2e:full` + deep scripts | all specs + employer-reg / register-approve-post-apply + Manual Excel |
