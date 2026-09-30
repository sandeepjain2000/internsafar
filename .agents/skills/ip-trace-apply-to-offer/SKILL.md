---
name: ip-trace-apply-to-offer
description: Trace or change the InternSafar hire pipeline — candidate apply (points debit, capacity lock, reapply after withdraw), employer shortlist/reject/interview (single and bulk), notifications and nav badges, and the offer lifecycle (send, re-offer, withdraw, expire, accept/decline). Use when touching ip_applications status, ip_offers, apply points, application notifications, or offer deadlines.
---

# Trace apply → shortlist/reject → notification → offer

Read first (app root `internship-portal/`):

- `docs/ai-context/domains/workflow-core.md` — offer lifecycle, notifications, badges
- `docs/ai-context/domains/candidate.md` — applications, in-progress rule, apply confirmation
- `docs/ai-context/domains/employer.md`
- `docs/ai-context/DECISIONS.md`
- `WORKBENCH_FEATURE_GUIDE.md` (employer applicant workbench)

## Invariants

- One application per (internship, candidate): `UNIQUE(internship_id, candidate_id)`. Reapply after `withdrawn` **reuses** the same row (status back to `applied`, event `reapplied`).
- Apply debits `POINTS_PER_APPLICATION` and writes `ip_points_ledger` (`application_spend`) **inside** `withApplicationCapacityLock` (real transaction + `pg_advisory_xact_lock` per internship). Insufficient points or full capacity → whole apply rolls back.
- Application statuses are a closed set (see `ALLOWED` in `api/ip/employer/applications/[id]/route.js` = `ip_applications_status_check`). Do not invent new ones.
- In-progress rule has one definition: `shortlisted`/`interviewing` always; `applied`/`pending` only while posting not `closed` and `apply_ends_at` not passed. SQL in `api/ip/nav-badges`, JS twin `isApplicationInProgress` in `src/lib/ipApplicationPresentation.js` — change both or neither.
- `ip_offers` is one row per application (`UNIQUE(application_id)`). Offer allowed only when application status ∈ `OFFERABLE_APPLICATION_STATUSES` (`src/lib/ipOfferPresentation.js`). Accepted or still-open pending offer → 409. Declined/expired/withdrawn offer row is **reused** (reset to `pending`, `created_at = now()`).
- Moving an application away from `offered` closes a pending offer as `withdrawn` (`closePendingOfferForApplication`; falls back to `expired` on DBs without migration 046).
- Candidate accept/decline requires offer `pending`, not expired, and application still `offered`. Accept → application `hired`; decline → `declined_offer`. This step **is** a real transaction.
- Expiry everywhere uses `offerIsExpired` (end of `valid_until` day).
- Notifications: `notifyUser` in `src/lib/ipNotify.js` never throws; respects per-user channel prefs; `skipEmail` means the caller sends its own email. Pages call `refreshNavBadges()` after mutations.
- Bulk shortlist/reject notifies only when the status actually changes.

## Workflow (trace in this order)

1. **Candidate detail + apply UI** — `src/app/candidate/internships/[id]/page.js` (redirects to `/candidate/applications?applied=<id>&spent=<pts>` on success).
2. **Apply API** — `POST` in `src/app/api/ip/candidate/applications/route.js`: accessibility check → screening validation → existing-app check → points pre-check → `withApplicationCapacityLock` (debit, ledger, insert or reopen, event) → first-application bonus → notify employer (in-app + direct email) → notify candidate.
3. **Capacity lock + bonus** — `src/lib/ipApplicationCapacity.js` (`MAX_ACTIVE_APPLICATIONS_PER_POSTING`, `withApplicationCapacityLock`); first-application bonus `maybeAwardFirstApplicationBonus` → `awardPointsOnce` in `src/lib/ipReferralCredit.js`.
4. **Employer workbench** — `src/app/employer/internships/[id]/page.js` (shows offer button only for offerable statuses).
5. **Single status change** — `PATCH` `src/app/api/ip/employer/applications/[id]/route.js`: update status (interview fields for `interviewing`) → `closePendingOfferForApplication` → interview thread/message → `notifyUser` to candidate.
6. **Bulk shortlist/reject/schedule_interview** — `src/app/api/ip/employer/internships/[id]/applicants/bulk/route.js` (all three close a pending offer; shortlist/reject notify-on-change).
7. **Offer send / re-offer** — `POST` `src/app/api/ip/offers/route.js` → inside one `transaction()`: `SELECT … FOR UPDATE` the application (must still be offerable) and the offer row (re-check accepted / live pending), then insert-or-reuse the offer and set application `offered` (duplicate hitting `UNIQUE(application_id)` → 409) → notify + email (per candidate prefs).
8. **Offer respond** — `PATCH` `src/app/api/ip/offers/[id]/route.js`: inside `transaction()` locks the application `FOR UPDATE` and requires `offered` before writing (concurrent employer change → 409 "no longer active"); remind: `src/app/api/ip/offers/[id]/remind/route.js`.
9. **Offer helpers** — `src/lib/ipOfferPresentation.js` (`OFFERABLE_APPLICATION_STATUSES`, `offerDeadlineEnd`, `offerIsExpired`, `offerDisplayStatus`), `src/lib/ipOfferLifecycle.js`.
10. **Surfaces** — `src/app/candidate/applications/page.js`, `src/app/candidate/offers/page.js`, `src/app/employer/offers/page.js`, `src/app/api/ip/notifications/route.js`, `src/app/api/ip/nav-badges/route.js`, `src/lib/ipNavBadges.js`, `src/lib/ipCandidateNotificationPresentation.js`.

## State layers — keep them separate when reporting

| Layer | Where it lives |
|-------|----------------|
| Application status | `ip_applications.status` (+ `ip_application_events` history) |
| Points spent | `ip_users.points` + `ip_points_ledger` |
| Offer state | `ip_offers.status`, `valid_until`, `responded_at` |
| Displayed offer state | `offerDisplayStatus` (pending past deadline shows **Expired** without a DB write) |
| In-app notification | `ip_notifications` (`archived_at` NULL = Inbox) |
| Email delivery | best-effort `sendMail`, logged on failure, never retried |
| Badge counts | `api/ip/nav-badges` (Inbox-only unread; in-progress apps) |

## Edge cases to test

- **Replay / double submit:** two fast applies to the same posting → exactly one application, points debited once (see risk 1 for the error code you get).
- **Reapply after withdraw:** same row id, status `applied`, interview/rejection fields cleared, new ledger row with `reapply: true`; first-application bonus not re-awarded.
- **Capacity:** posting at the cap → 409, no points debited.
- **Mixed existing/new:** bulk reject on a mix of already-rejected and applied rows → only changed rows notified; pending offers on changed rows become `withdrawn`.
- **Re-offer:** declined → new offer reuses the row; pending but past deadline → allowed; pending in date → 409.
- **Accept race:** employer rejects while candidate accepts → accept gets 409 ("no longer active") or the reject withdraws the offer; never both `hired` and `withdrawn`.
- **Timezone:** `valid_until` date-only vs timestamp; server TZ (Vercel = UTC, EC2 = check) vs IST users; interview time text built server-side (see risk 3).
- **DB without 046:** status change away from `offered` stores `expired` instead of `withdrawn`, no crash.
- **Notifications prefs off:** in-app row skipped when `inApp` false; `forceEmail` employer events still email.
- **Rollback:** force failure inside the capacity lock → no application, no ledger row, points unchanged.

## Known risks seen while writing this skill (2026-09-30 — observed; fixed items marked)

1. The "already have an active application" check runs **outside** the lock. A true double submit falls through to the UNIQUE constraint inside the lock — the transaction rolls back (points safe) but the response is likely a 500, not a clean 409.
2. ~~`POST /api/ip/offers` upserts the offer and sets the application to `offered` as separate queries.~~ **Fixed 2026-09-30:** both writes now run in one `transaction()`; duplicate-offer race → 409.
3. Single status `PATCH` builds interview text with server-side `new Date(...).toLocaleString()` — on UTC hosts IST users see UTC times. It also notifies even when the status did not change (bulk does not).
4. `offerDeadlineEnd` uses the **server's** local end-of-day and only when `valid_until` arrives as a ≤10-char string; if `pg` returns a `Date` object the deadline becomes the start of that day. Verify the runtime type before relying on "end of day".
5. `PATCH` allows any status in `ALLOWED` with no transition rules (e.g. directly to `hired` or `offered` without an offer row). That may be intended; confirm with the owner before tightening.

## Out of scope

- Messages/threads beyond the interview auto-message.
- Points economy design (earn rates, referral rules) — only the apply debit is in scope.
- Ratings, endorsements, completions after hire.
- New statuses or offer states without an explicit DB/API/product design.
