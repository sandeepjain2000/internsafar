# Manual / API one-shot QA cases

These cases are **excluded** from overwriting Pass results in `apply-internsafar-qa-xlsx.py`
(`MANUAL_ONLY_TC_IDS`) and/or need a dedicated script (OTP / form-path API).

| TC ID | Script | Notes |
|---|---|---|
| TC-IS-06-007 | `run-tc-is-06-007-email-change.mjs` | Zoho OTP — see `test-cases/manual/TC-IS-06-007-EMAIL-CHANGE.md` |
| TC-IS-03-007 | `run-tc-is-03-007-form-referral.mjs` | Candidate form referral + SA approve/reject |
| TC-IS-03-011 | `run-tc-is-03-011-employer-manual-request.mjs` | Employer Form manualRequest + SA list |
| TC-IS-03-013 | `run-tc-is-03-013-duplicate-employer.mjs` | Domain path duplicate work email → 409 |
| TC-IS-03-015 | `run-tc-is-03-015-self-referral.mjs` | Own email + own referral code → 409 / no points |
| TC-IS-03-022 + 03-023 | `run-tc-is-03-022-023-register-rejects.mjs` | Non-Gmail + personal-Gmail domain rejects (no OAuth) |

Run with Vercel or local base URL. Use `--apply-excel` to write Pass into `InternSafar-Test-Cases.xlsx` and a dated copy `InternSafar-Test-Cases-YYYY-MM-DD.xlsx` (Index title stamped with that date).
