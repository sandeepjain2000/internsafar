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
| Cron | `src/app/api/ip/cron/`, `scripts/process-ip-schedule-reminders.mjs`, `scripts/process-ip-export-jobs.mjs`, daily progress report cron |

## Mail + unsubscribe (cross-cutting)

Outbound mail may append an unsubscribe footer (`src/lib/mail.js` → `ipEmailUnsubscribe*`). Clicking `/unsubscribe?token=…` records a **PENDING** request only — delivery continues until SuperAdmin processes it. Token URLs must not embed the recipient email.

## Constraints

- Changes often cross candidate ↔ employer — inspect both UIs and APIs.
- Do not invent status enums; read presentation helpers and DB check constraints / migrations.
- Cron/reminder behaviour may be env-gated — check scripts before changing schedules.

## Related domains

Candidate, Employer, Database, Auth.

## Inspect before modifying

Both role UIs (if shared), API routes, and lib presentation/state helpers.
