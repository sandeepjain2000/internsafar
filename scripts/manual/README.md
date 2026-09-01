# Manual-only QA cases

These cases are **excluded** from `run-internsafar-qa.mjs` so a full automated run does not Block/Fail them when OTP or human steps are required.

| TC ID | Script | Doc |
|---|---|---|
| TC-IS-06-007 | `run-tc-is-06-007-email-change.mjs` | `test-cases/manual/TC-IS-06-007-EMAIL-CHANGE.md` |

Registration / account-creation (sheet 03, legacy `REG-*`) stay **Manual** in Excel and are recorded as **Blocked** in the automated runner only — they are not executed here either.

Run manual scripts with `npm run dev` up. Use `--apply-excel` to update `test-cases/InternSafar-Test-Cases.xlsx` without touching automated `qa-results.json`.
