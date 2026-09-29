# Excel ↔ live product re-sync

**Date:** 2026-09-28  
**Workbook:** `test-cases/InternSafar-Test-Cases.xlsx` (270 `TC-IS-*` after sync)  
**Compared to:** sibling `internship-portal` `src/` + `qa/tests/` (includes the 2026-09-26 changes: employer email verify, Hybrid E documents, approvals tabs, Adjust Points, Action center card, retired form/manual/viral paths)  
**Script:** `scripts/sync-internsafar-xlsx-2026-09-28.py` (idempotent; `--dry-run` supported)  
**Backup:** `_archive-root-clutter/InternSafar-Test-Cases.pre-2026-09-28-sync.xlsx`

## Summary

| Triage | Count | Notes |
|--------|-------|-------|
| Removed | 16 | Retired features / duplicates (rows deleted, not marked Obsolete) |
| Edited | 50 | Steps / expected / roles rewritten to live behaviour; status reset to Not Run |
| Added | 36 | Email verify, documents gate, approvals tabs, Adjust Points, retired-path 410s, UI details |
| Global wording | all rows | Core accounts, `/` shared login (no `/superadmin/login` form), "browse tabs" |

## Removed

| ID | Reason |
|----|--------|
| TC-IS-03-004 | Candidate form path returns 410 → replaced by TC-IS-03-028 |
| TC-IS-03-007 | Form-path referral credit after SA approval — form path retired |
| TC-IS-03-011 | Employer manual request → replaced by TC-IS-03-029 |
| TC-IS-03-017 | Form-path captcha — form path retired |
| TC-IS-03-020 | Employer Google domain register removed |
| TC-IS-03-023 | Employer Google domain register removed |
| TC-IS-05-004 | Duplicate of TC-IS-06-007 (email change lives on `/account`) |
| TC-IS-06-009 | Resume links UI removed from candidate profile |
| TC-IS-14-002/003/004/019 | Form Registrations queue retired (redirect + API 410 → TC-IS-14-031) |
| TC-IS-14-008/009/021 | Manual Requests queue retired (→ TC-IS-14-031) |
| TC-IS-18-018 | Viral shares removed |

## Edited (main themes)

| Area | Rows | Change |
|------|------|--------|
| Landing / auth | 01-001, 01-004, 01-009, 02-001, 02-006, 02-014, 02-021, 02-023 | Footer How it works · Help Center; SuperAdmin signs in on `/` (`/superadmin/login` redirects); every role signs out to `/` |
| Registration | 03-002, 03-003, 03-008–03-010, 03-012, 03-013, 03-018 | Domain vs Free-email paths; email verify + resend; soft-flag (not 400) for free/disposable/mismatched domain; password BVA 7/8 |
| Permissions | 04-002, 04-009 | Retired SA pages; pending employer may sign in after verify |
| Candidate profile | 06-001, 06-002, 06-004, 06-006–06-008 | Six tabs; `REQUIRED_FOR_COMPLETE`; email change on `/account` |
| Browse | 07-002, 07-003, 07-017, 07-018 | Tabs Unapplied (default) / All / Starting soon / Saved / Recommended; List default (`ip_browse_view`) |
| Employer | 09-001, 09-011, 09-014, 09-017 | Posting form Back / Save Draft / Next Tab; Action center is one card (number + one hint) |
| Points | 13-002, 13-004 | Signup +50 both roles, apply −5, publish −50 |
| SuperAdmin | 14-001, 14-005–14-007, 14-010, 14-022 | Approvals tabs; Final Approval document gate; Reset Ethics |
| Cross-cutting | 18-001–18-004, 18-019, 18-027–18-029, 18-032, 18-034 | Posting gate order; xlsx exports; zip CV downloads |

## Added

| IDs | Topic | Automation |
|-----|-------|------------|
| 02-028, 02-029 | Pending employer sign-in before / after email verify | Manual |
| 03-024 | Register chooser: Domain-based + Free-email-based, no Google | Automated (IS-070) |
| 03-025–03-027, 03-030 | Free-email register, verify link, resend cooldown, own password | Manual |
| 03-028, 03-029 | Candidate form path / employer manualRequest → 410 | Automated (IS-067, IS-068) |
| 07-025 | Browse opens on Unapplied | Automated (IS-078) |
| 09-018 | Publish Now only on Screening tab | Automated (IS-076) |
| 09-019–09-021 | Stipend max ≥ min; single-candidate ZIP; xlsx exports | Manual |
| 12-011, 12-012 | Messages bulk archive; Notifications Please Wait… | Manual |
| 13-005 | SA point adjustment in ledger + notice | Manual |
| 14-024–14-029, 14-032, 14-033 | Documents gate, sticky approval, suspend/restore, reject, Reset Ethics, Adjust Points UI, Listing reports, soft delete | Manual |
| 14-030 | Adjust Points validation + 403 for non-SA | Automated (IS-072) |
| 14-031 | Retired SA pages redirect, APIs 410 | Automated (IS-071) |
| 14-034 | Approvals tabs + tab-specific bulk actions | Automated (IS-073) |
| 17-006, 17-007 | Document supersede; logo URL hidden | Manual |
| 17-008 | `/api/ip/files` cross-user denied | Automated (IS-057) |
| 18-049, 18-050, 18-052 | Employer profile tabs/order; locked ethics 403; Filters Show/Hide | Automated (IS-074, IS-075, IS-077) |
| 18-051, 18-053 | Posting gate order; Title Case badges | Manual |

## Playwright changes

| File | Change |
|------|--------|
| `qa/tests/regression.spec.js` | IS-001 footer links; new IS-067 → IS-078; IS-063 rewritten for single-card Action center |
| `qa/tests/journeys-employer.spec.js` | JOURNEY-EMP-01 asserts "Action center" label (was "Action required") |
| `qa/routes-by-role.js` | SA routes: drop Form registrations / Manual requests; add Adjust Points, Listing reports |
| `scripts/apply-playwright-regression-xlsx.mjs` | Title → TC map fixed (IS-008/IS-026 → 02-014, IS-057 → 17-008, IS-041 → 07-012) and new IS-067–IS-078 entries; dropped wrong JOURNEY-EMP-02 → 09-017 |

## Results hygiene

`test-cases/qa-results.json` kept replaying pre-change results onto edited rows (e.g. TC-IS-03-009 showed Pass with the retired 400 domain-mismatch error). Stale records for removed / edited / added rows were pruned (backup: `_archive-root-clutter/qa-results.pre-prune-2026-09-28.json`); those rows show Not Run until re-executed.

## Regression run

`npm run qa:e2e:regression` on localhost (2026-09-28, after fixes): **114 passed, 0 failed, 0 skipped**.

Workbook after apply: **270 cases — Pass 203, Fail 0, Not Run 67**. All 49 Automated rows Pass. The 67 Not Run rows are Manual (new manual cases + edited manual rows whose old results were pruned) and need a manual pass. Dated snapshot: `test-cases/InternSafar-Test-Cases-2026-09-28.xlsx`.

First run (before the Action center test fix) failed IS-063 and JOURNEY-EMP-01 only — both were stale "Action required" assertions after the dashboard moved to a single Action center card.

## Product issues found while syncing

1. **Employer register ack email copy was stale** — said "You can sign in after SuperAdmin approval". **Fixed 2026-09-28:** now says sign in after email verify to upload documents; posting unlocks after approval.
2. **Restore was blocked by a pending document** (re-ran the Final Approval gate, inconsistent with sticky approval). **Fixed 2026-09-28:** suspended → approved skips the document check and sends "Employer Account Restored"; the API now only allows Suspend from approved. TC-IS-14-026 / 14-006 updated.
   **Revised 2026-09-29 (owner decision):** Restore is blocked while any document is pending review, with the message "Cannot restore <Company>: N document(s) still waiting for review…" and an Open Documents link. Approving or rejecting the document unblocks it (approve-only would strand employers with a bad doc, since suspended employers cannot sign in). The ≥1-approved Final Approval check is still not re-run. TC-IS-14-026 / 14-006 rewritten.
