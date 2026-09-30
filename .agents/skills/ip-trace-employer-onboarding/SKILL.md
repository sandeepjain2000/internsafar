---
name: ip-trace-employer-onboarding
description: Trace or change the InternSafar employer journey end to end — register, email verify, login while pending, upload documents, SuperAdmin document review, Final Employer Approval, Suspend/Restore/Reject, and the posting gate. Use when touching employer registration, the EMAIL_NOT_VERIFIED login path, employer approval_status, Final Approval rules, or anything that decides whether an employer can post.
---

# Trace employer onboarding (register → verify → pending login → docs → approve → post)

Read first (app root `internship-portal/`):

- `docs/ai-context/domains/auth.md` — employer login/approval table
- `docs/ai-context/domains/employer.md` — posting gate, Hybrid E docs
- `docs/ai-context/domains/superadmin.md` — approvals, Suspend vs Reject, Restore rule
- `docs/ai-context/DECISIONS.md`
- `docs/employer-registration-flow.puml`, `docs/qa-employer-register-e2e.md`
- Document replacement detail: skill `ip-trace-employer-documents-hybrid-e`

## Invariants

- `approval_status` values: `pending` | `approved` | `rejected` | `suspended`. Suspend and Reject stay **distinct**; both block login.
- Login (`src/lib/auth.js`): pending + email **not** verified → `EMAIL_NOT_VERIFIED:` error (UI shows Resend). Pending + verified → session allowed so docs can be uploaded. Rejected / suspended → blocked.
- Email verified means `ip_users.email_verified_at` is set. `email_verify_required === false` exists as a legacy read path only — **never** write it as a "grandfather" flag; fill `email_verified_at` instead.
- Verify token: random 32 bytes, stored as sha256 hash only, 48 h TTL, single use. Issuing a new token consumes all earlier unconsumed tokens for that user.
- Final Approval needs ≥1 approved **active** doc and **no** pending active doc (`assertDocumentsReadyForFinalApproval`). Active = `superseded_at IS NULL`.
- Restore (suspended → approved) skips the ≥1-approved re-check but is blocked while any active doc is pending (`assertNoPendingDocumentsForRestore`). Rejecting the doc also unblocks (suspended employer cannot log in to replace it).
- Suspend only from `approved` (or already `suspended`).
- Posting gate (`getEmployerPostingGate`) needs **all**: approved, email verified, ethics saved (`ethics_accepted_at` + `allEthicsChecked`), `profile_complete`. Enforced in the API, not just the nav.
- Candidates do **not** go through this verify gate.

## Workflow (trace in this order)

1. **Register UI** — `src/app/register/employer/page.js` (Gemini-styled; keep Playwright IDs).
2. **Register API** — `src/app/api/ip/auth/register-employer/route.js`: creates `ip_users` + `ip_employers` (`approval_status = 'pending'`), then calls `sendEmployerEmailVerification`. Mail failure does not roll back the token (response carries a warning).
3. **Verify lib** — `src/lib/ipEmployerEmailVerify.js`: `ensureIpEmployerEmailVerifySchema`, `sendEmployerEmailVerification`, `consumeEmployerEmailVerification` (sets `email_verified_at = coalesce(email_verified_at, now())`).
4. **Verify page** — `src/app/register/employer/verify/page.js` (server component; consumes `?token=`).
5. **Resend** — `src/app/api/ip/auth/employer-email-verify/resend/route.js` (used by login UI and post-register screen).
6. **Login gate** — `src/lib/auth.js` employer block (~L227–281); error prefix parsed in `src/components/ip/IpSignInLanding.jsx`.
7. **Pending portal chrome** — `src/app/employer/layout.js`: reads `approvalStatus` from `/api/ip/employer/dashboard`; non-approved gets reduced nav and redirect away from gated pages. This is UI only — the API gate in step 11 is the real guard.
8. **Docs upload** — `src/app/employer/profile/page.js` (Documents tab) → `src/app/api/ip/employer/documents/upload/route.js` (S3) → `replaceEmployerDocument` in `src/lib/ipEmployerDocuments.js`.
9. **SA document review** — `src/app/superadmin/documents/page.js` → `src/app/api/ip/superadmin/documents/route.js` (`PATCH` → `setOne`; `rejected` is stored as `flagged`; notifies employer).
10. **SA Final Approval / Reject / Suspend / Restore** — `src/app/superadmin/approvals/page.js` → `src/app/api/ip/superadmin/employers/[id]/route.js` (`PATCH` → `setOneStatus` → doc asserts → `UPDATE ip_employers` → `notifyUser` + `sendMail`). Bulk uses the same `PATCH` with `ids[]`; partial failures come back in `failures`.
11. **Posting gate** — `src/lib/ipEmployerPostingGate.js`, called from `src/app/api/ip/employer/internships/route.js` (create) and `src/app/api/ip/employer/internships/[id]/route.js` (update/publish). Ethics helper: `src/lib/employerEthics.js`.

## State layers — keep them separate when reporting

| Layer | Where it lives |
|-------|----------------|
| Email verified | `ip_users.email_verified_at` |
| Verify token state | `ip_employer_email_verifications` (`consumed_at`, `expires_at`) |
| Account approval | `ip_employers.approval_status`, `approval_reviewed_at`, `rejection_reason` |
| Document review | `ip_employer_documents.review_status` (`pending`/`approved`/`flagged`) on **active** rows |
| Ethics | `ip_employers.ethics_acks`, `ethics_accepted_at` |
| Profile | `ip_users.profile_complete` |
| What the nav shows | `employer/layout.js` (derived, not authoritative) |

"Can post" is only true when the gate returns `ok: true` — never infer it from nav or from `approval_status` alone.

## Edge cases to test

- **Replay:** open the same verify link twice → second shows "already used". Old link after Resend → invalid/used. Expired link (>48 h) → expired message with Resend hint.
- **Mixed old/new rows:** existing employer with `email_verified_at` filled by the one-time fill vs new signup with NULL → both behave per the table above; no one is asked to re-verify.
- **Pending login:** verified + pending can log in, reach Profile & docs, and `POST /api/ip/employer/internships` returns 403 with the approval message.
- **Approved but unverified** (should not occur after fills): login is allowed (auth only checks verify while pending) but posting returns the verify-email 403.
- **Final Approval blocked:** no docs / any pending doc / only flagged docs → each returns its own message; nothing is updated.
- **Restore:** suspended + pending doc → blocked; after SA approves **or** rejects the doc → Restore succeeds.
- **Suspend from pending/rejected** → refused.
- **Bulk approve** with one employer not ready → others succeed, `failures[]` lists the blocked one.
- **Ethics reset** (`action: resetEthics`) → `profile_complete` false → posting blocked again until re-saved.
- **Timezone:** token TTL and `expires_at` are absolute timestamps; check around the 48 h boundary, not day boundaries.
- **Rollback:** force an error after the user insert in register → confirm no half-created employer (see risk 1).

## Known risks seen while writing this skill (2026-09-30 — observed, not fixed)

1. `register-employer/route.js` and `consumeEmployerEmailVerification` run `query('BEGIN')` / `query('COMMIT')` through the **pool**. `src/lib/db.js` `query()` takes a new client per call, so these are not real transactions. The correct helper already exists: `transaction(fn)` in `src/lib/transaction.js` (used by `api/ip/offers/[id]`). Treat "rollback" claims on these paths as unproven until fixed.
2. `setOneStatus` checks documents, then updates status in separate queries — an upload landing in between can be approved past a new pending doc.
3. The approval email built in `setOneStatus` links to relative `/employer` (no origin), unlike `notifyUser` which uses `resolveAppOrigin`.

Raise these with the owner before changing them; do not silently fix inside an unrelated task.

## Out of scope

- Candidate registration (Google verify path) and candidate login.
- Inventing new approval states, grandfather flags, or a second verification system.
- Changing Placement Hub / `ism_*` tables or the nested mono copy.
- UI restyle of these screens (use the Gemini handoff rule + UI skills instead).
