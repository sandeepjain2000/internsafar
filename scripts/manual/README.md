# Manual / API one-shot QA cases

These cases are **excluded** from overwriting Pass results in `apply-internsafar-qa-xlsx.py`
(`MANUAL_ONLY_TC_IDS`) and/or need a dedicated script (OTP / Google-gated API).

All runners use the disposable **test accounts** (`npm run qa:ensure-test-accounts`), never core accounts.

| TC ID | Script | Notes |
|---|---|---|
| TC-IS-06-007 | `run-tc-is-06-007-email-change.mjs` | Zoho OTP — see `test-cases/manual/TC-IS-06-007-EMAIL-CHANGE.md` |
| TC-IS-03-013 | `run-tc-is-03-013-duplicate-employer.mjs` | Free-email register with the test employer's email + real captcha → 409 (nothing created) |
| TC-IS-03-015 | `run-tc-is-03-015-self-referral.mjs` | Test candidate email + own referral code → 409 / no points. Needs a local server with `IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1`; otherwise reports Blocked (Google token gate answers 401 first) |

Retired (2026-10-07): TC-IS-03-007 candidate form referral and TC-IS-03-011 employer manual request — both flows return 410 and the workbook rows are gone. TC-IS-03-023 (personal Gmail on Domain path) is now the soft-flag case TC-IS-03-009 in the checklist runner.

Retired (2026-10-10): TC-IS-03-022 non-Gmail candidate register — the checklist runner's REG-C-2 (TC-IS-03-002) sends the same request and expects the same 400, so the one-off script was removed.

Pass the base URL as the first argument (local or Vercel). Every run records its result (Pass, Fail or Blocked, with the run time) into `test-cases/qa-results.json` through `scripts/lib/recordQaResults.mjs`; `--apply-excel` also writes the workbook. 03-013 also records `REG-E-6`, and 03-015 also records `REG-C-9`.

Test accounts: 03-013 and 03-015 first run `ensureQaTestAccounts` (it creates or repairs the test accounts on local or `*.vercel.app` hosts) and then `requireQaLogin`. If the test account still can't sign in, the script stops with a clear error saying to run `npm run qa:ensure-test-accounts` on that host. It never falls back to a core account. 06-007 creates its own throwaway candidate.

`npm run qa:all` runs 03-013 and 03-015 against `IP_BASE` (default `http://localhost:3000`) and then applies the results to Excel. 06-007 stays manual because it sends a real OTP email and needs a person to paste the code.
