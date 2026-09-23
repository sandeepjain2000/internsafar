# QA test accounts & employer register E2E

## Employer registration flow (live)

Canonical diagram: `docs/employer-registration-flow.puml` (checked against live `register-employer` on 2026-09-23).

Live behaviour:

1. Domain-based **or** Free-email-based on `/register/employer`
2. `POST /api/ip/auth/register-employer` creates pending `ip_users` + `ip_employers`
3. Sends **email verification link** + **registration ack** mail
4. Employer confirms via `/register/employer/verify?token=…`
5. SuperAdmin **Documents** must have ≥1 approved doc (no pending) before **Final Employer Approval**
   - Canonical gate diagram + QA sequence: `docs/employer-final-approval-documents-first.puml`
   - Generator: `node scripts/generate-employer-final-approval-documents-first-puml.mjs`
6. Then employer signs in with the **password they chose on the form**

**There is no temporary-password email for employers.** (Candidate Google register still emails a temp password — different flow.)

Related SA diagrams:
- `docs/employer-final-approval-documents-first.puml` (docs-first Final Approval + test case)
- `docs/superadmin-employer-approval-vs-manual-flow.puml` (Approvals queue vs retired Manual)

## QA verify-token exposure (no inbox required)

| Env | Effect |
|-----|--------|
| `IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1` | Register JSON may include `qaVerifyUrl` + `qaOutboundMails` |
| `VERCEL_ENV=production` | **Always off** even if the flag is set |
| Flag unset / `0` | Response never includes QA fields (default) |

Downloading scripts from GitHub alone cannot bypass production. The **server** must run with the flag, and not on Vercel production.

Helper: `src/lib/ipQaEmployerRegister.js`  
Wired in: `src/app/api/ip/auth/register-employer/route.js`

Local / CI: put the flag in `.env.local` (gitignored) or Actions env. Documented in `.env.example`. Never commit a real enabled secret for production.

## E2E script (deep — login at every gate)

```bash
# Server must have IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1
npm run qa:register-approve-post-apply
npm run qa:employer-reg-e2e
npm run qa:employer-reg-e2e -- --path=free_email
```

Must assert (not optional):

1. Login **fails** before email verify  
2. Login **succeeds** after verify while still **pending** + dashboard/profile/docs  
3. Final Approve with **0 docs** → **BLOCK**  
4. Upload pending doc → Final Approve → **BLOCK**  
5. Approve document in Documents → Final Approve → **OK**  
6. Fresh employer login after approval  
7. Posting still **blocked** until Final Approval (covered before step 5)  
8. Core candidate login + apply (deeper smoke: `qa:register-approve-post-apply`)


## Test account rules (variety; no core spam)

See also Cursor rule `qa-test-account-variety` and helper `scripts/lib/ipQaRealisticPersonas.mjs`.

```text
❌ Reuse core showcase emails for bulk apply / accept / message spam
❌ One employer receiving hundreds of scripted applications so lists look like a single company
❌ Emails / names / internship titles that are random digit strings (user48291, Co_998877)
❌ Always the same candidate ↔ same employer pair for every case

✅ Fresh realistic persona per run (human name + believable company + role title)
✅ Keep cores for explicit core-account cases only (qa/helpers/accounts.js)
✅ Prefer .example company domains for Domain path; unique local-part tag for Free-email
✅ Internship titles like “Data Analyst Intern”, not “QA Post mt140t02”
✅ Spread activity across several personas so SA / employer lists show variety
```

Protected core needles (do not target for filler traffic): `lawsonlclintern*`, `placementhubsupport@gmail.com`, `support@placementhub.online`.
