# TC-IS-06-007 — Manual email-change OTP test

**Workbook:** `06 Candidate Profile` · **Automation column:** Manual  
**Runner:** `scripts/manual/run-tc-is-06-007-email-change.mjs`  
**Not part of:** `scripts/run-internsafar-qa.mjs` (full automated QA skips this case)

---

## Why this is manual

The app emails a **real 6-digit OTP** to the new address. Automation cannot guess the code unless an operator copies it from **Zoho/Gmail**. That is intentional — this case proves live mail delivery, not just API shape.

## Why runs fail (common causes)

| Symptom | Cause | Fix |
|---|---|---|
| **Blocked** “Paste the 6-digit Zoho code…” | Step 1 succeeded; waiting for step 2 | Copy OTP into `.env.local`, re-run within **10 minutes** |
| **Blocked** “Stale or wrong OTP” / verify 400 | Old code in env, expired OTP, or re-requested email | **Remove** `IP_QA_EMAIL_CHANGE_CODE`, run step 1 again, paste **fresh** code |
| No mail in Zoho | `OUTBOUND_EMAIL_OVERRIDE` set but gate off | Add `ISM_TEST_ENVIRONMENT=true` to `.env.local` and **restart** `npm run dev` |
| Mail only to Gmail, not Zoho | Gate was off | Same as above — gate copies to `support.placementhub@placementhub.online` |
| **Fail** on full automated QA (old runs) | Case used to run inside automated suite with stale env code | Use **this manual script only**; full QA no longer runs 06-007 |

**Accounts (QA fixtures, reused every run):**

- From: `lawsonlclintern+qa-email-change-from@gmail.com`
- To: `lawsonlclintern+qa-email-change-to@gmail.com`
- Password: same as other QA candidates (`QA_ACCOUNTS.candidate.password` in seeded data)

After a successful verify, the script **restores** the original “from” email in the database.

---

## Prerequisites

1. `npm run dev` → `http://localhost:3000`
2. `.env.local`: `DATABASE_URL`, mail (`ZEPTOMAIL_*` or `SMTP_*`)
3. Optional but recommended for Zoho copy:
   ```env
   ISM_TEST_ENVIRONMENT=true
   OUTBOUND_EMAIL_OVERRIDE=support.placementhub@placementhub.online
   ```
4. **`IP_QA_EMAIL_CHANGE_CODE` must be unset** before step 1

---

## Procedure (two runs, same command)

### Step 1 — Request OTP

```powershell
cd internship-portal
node scripts/manual/run-tc-is-06-007-email-change.mjs
```

Expected: **`Blocked`** — request OK, wrong code rejected, email sent.

Check inbox for subject **“Verify your new PlacementHub email”**.

### Step 2 — Verify (within 10 minutes)

Add to **`internship-portal/.env.local`** only (never commit):

```env
IP_QA_EMAIL_CHANGE_CODE=123456
```

(use the real 6-digit code)

```powershell
node scripts/manual/run-tc-is-06-007-email-change.mjs
```

Expected: **`Pass`** — wrong code 400, correct code 200, emails restored.

### Step 3 — Clean up

Remove `IP_QA_EMAIL_CHANGE_CODE` from `.env.local` so the next run does not reuse a dead code.

### Optional — update Excel in place

```powershell
node scripts/manual/run-tc-is-06-007-email-change.mjs --apply-excel
```

Writes `scripts/manual/last-tc-is-06-007-result.json` and updates row **TC-IS-06-007** on sheet **06 Candidate Profile** (Automation stays **Manual**).

Or use the shared updater:

```powershell
python "..\_archive-root-clutter\testcase-picker\update_case_result.py" scripts/manual/last-tc-is-06-007-result.json
```

---

## npm shortcut

```powershell
npm run qa:manual:email-change
npm run qa:manual:email-change -- --apply-excel
```

---

## Related files

| File | Role |
|---|---|
| `scripts/manual/run-tc-is-06-007-email-change.mjs` | Manual runner (only entry point) |
| `scripts/lib/ipQaRemainingExtras.mjs` | `runTcIs06007()` implementation |
| `src/app/api/ip/candidate/profile/email-change/request/route.js` | Sends OTP email |
| `src/app/api/ip/candidate/profile/email-change/verify/route.js` | Validates code (10 min TTL) |
| `src/lib/mail.js` | Zoho copy when `ISM_TEST_ENVIRONMENT=true` |
