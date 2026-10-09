# Domain: Workflow core (applications, messages, offers)

## Responsibility

Cross-role hire pipeline: applications, messaging threads, offers/onboarding, notifications, ratings/endorsements, nav badges.

## Central sources

| Path | Role |
|------|------|
| `src/app/api/ip/messages/` | Threads, attachments |
| `src/app/api/ip/offers/` | Offers + remind |
| `src/app/api/ip/notifications/` | Notifications |
| `src/app/api/ip/ratings/`, `endorsements/` | Ratings / endorsements |
| `src/app/api/ip/nav-badges/` | Badge counts |
| Candidate pages | `applications`, `messages`, `offers`, `notifications` |
| Employer pages | workbench applicants, `messages`, `offers`, `notifications` |
| Libs | `ipMessage*.js`, `ipOffer*.js`, `ipNotify.js`, `ipLinkThreadApplication.js`, `ipApplication*.js` |
| Cron | `src/app/api/ip/cron/`, `scripts/process-ip-schedule-reminders.mjs`, `scripts/process-ip-export-jobs.mjs`, daily progress report cron, weekly employer docs reminder (`cron/employer-docs-reminder`, see `domains/employer.md`) |

## Mail + unsubscribe (cross-cutting)

Outbound mail may append an unsubscribe footer (`src/lib/mail.js` → `ipEmailUnsubscribe*`). Clicking `/unsubscribe?token=…` records a **PENDING** request only — delivery continues until SuperAdmin processes it. Token URLs must not embed the recipient email.

## Notifications folders + nav badges (2026-09-28)

- Candidate/employer notifications have **Inbox** and **Archived** folders (`ip_notifications.archived_at`; NULL = Inbox). Users **archive / move back**; they cannot delete.
- `PATCH /api/ip/notifications` with `{ ids, archive: true|false }` moves rows between folders. `DELETE` is **SuperAdmin only** (403 for candidate/employer). No SuperAdmin screen deletes other users' notifications yet.
- Notifications unread badge counts **Inbox only**. Candidate **My applications** badge = in-progress apps: `shortlisted`/`interviewing` always; `applied`/`pending` only while posting not `closed` and `apply_ends_at` not passed.
- Pages call `refreshNavBadges()` (`src/lib/ipNavBadges.js`) after mutations; `PortalShell` refetches on that event and on route change.

## Candidate deadline alerts (on load, no cron)

- **Offer expiring** — `ensureCandidateOfferExpiryNotices` (`GET /api/ip/notifications`): once per pending offer within 3 days (`meta.kind = 'offer_expiring'`).
- **Saved internship closing soon (2026-10-09)** — `ensureCandidateSavedClosingNotices` in `src/lib/ipCandidateNotificationPresentation.js`, run by `GET /api/ip/nav-badges` (every page change) and `GET /api/ip/notifications`. One in-app alert when a saved internship is still candidate-visible, closes within `SAVED_CLOSING_ALERT_HOURS` (72) and the candidate has no non-withdrawn application. Category `application`, no email; skipped when the candidate turned off in-app application alerts. Fixed id `ip_notif_sc_<userId>_<internshipId>_<deadline epoch>` + `notifyUser({ id })` → `ON CONFLICT (id) DO NOTHING`, so concurrent calls cannot duplicate and an extended deadline gets a fresh alert. Row shows `company · title · Closes <IST>`; urgent under 24 h; no deadline once applied/closed. Confidential postings use `candidateFacingCompany`. No schema change.
- `notifyUser({ id })` (`src/lib/ipNotify.js`): optional fixed id for once-only notices — returns null (no email) when the row already exists or in-app is off.
- Employer "posting launches / applications closing soon" reminders (`processScheduleReminders`, `POST /api/ip/cron/schedule-reminders`) only fire when the employer ticked them **and** something calls the cron — it is **not** in `vercel.json` crons nor the documented EC2 crontab (2026-10-09).

## Offer lifecycle (2026-09-29)

- `ip_offers` is **one row per application** (`UNIQUE (application_id)`); status check is `pending|accepted|declined|expired|withdrawn` (`withdrawn` added by migration **046**; `expired` = deadline passed, `withdrawn` = employer changed the application).
- `POST /api/ip/offers`: allowed only when the application status is in `OFFERABLE_APPLICATION_STATUSES` (`src/lib/ipOfferPresentation.js`: applied, pending, shortlisted, interviewing, offered, declined_offer). 409 if the existing offer is `accepted` or still pending (not past `valid_until`). A **declined, expired or withdrawn** offer is **reused**: same row reset to `pending` with the new terms, `responded_at`/`last_reminded_at` cleared, `created_at = now()`.
- Employer status change away from `offered` (single PATCH or bulk shortlist/reject) closes a pending offer as `withdrawn` (`closePendingOfferForApplication` in `src/lib/ipOfferLifecycle.js`; falls back to `expired` on a DB without migration 046; Supabase and AWS both have it since 2026-09-29). Candidate accept/decline requires application still `offered`.
- Expiry everywhere uses `offerIsExpired` (end of `valid_until` day). Accept/decline emails go to candidate and employer **separately**; remind email link is absolute (`resolveAppOrigin`).

## Constraints

- Changes often cross candidate ↔ employer — inspect both UIs and APIs.
- Do not invent status enums; read presentation helpers and DB check constraints / migrations.
- Cron/reminder behaviour may be env-gated — check scripts before changing schedules.

## Related domains

Candidate, Employer, Database, Auth.

## Inspect before modifying

Both role UIs (if shared), API routes, and lib presentation/state helpers.
