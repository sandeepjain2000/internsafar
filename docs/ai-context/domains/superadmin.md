# Domain: SuperAdmin

## Responsibility

Platform oversight: employer approvals, manual requests, documents, postings, posting share rewards, login report, form registrations, feature ideas, messages, bootstrap.

## Central sources

| Path | Role |
|------|------|
| `src/app/superadmin/**` | Pages |
| `src/app/api/ip/superadmin/**` | SuperAdmin APIs |
| `src/app/api/ip/bootstrap/` | Demo/bootstrap ensure |
| `src/lib/ensureIpBootstrap.js` | Bootstrap helper |
| Login page | `/superadmin/login` (not public `/`) |

## Pages (confirmed)

| Route | Purpose |
|-------|---------|
| `/superadmin` | Dashboard |
| `/superadmin/login` | SuperAdmin login |
| `/superadmin/approvals` | **Only** employer approval queue (Domain + Free-email). Path column on rows. |
| `/superadmin/documents` | Documents |
| `/superadmin/postings` | Postings oversight |
| `/superadmin/promotions` | Posting Share Rewards (LinkedIn posting-share claims) |
| `/superadmin/points` | Adjust Points (SA manual add/deduct; support-only; users get notification only) |
| `/superadmin/login-report` | Login report (default **All time**; not wiped by core reset) |
| `/superadmin/messages` | Messages |
| `/superadmin/feature-ideas` | Feature ideas |

Retired (redirect → `/superadmin`): `/superadmin/viral` (orphaned viral-shares queue; APIs/table may remain).  
Retired (redirect → `/superadmin/approvals`): `/superadmin/form-registrations`, `/superadmin/requests`.  
APIs for those queues return **410**. Schema dropped on bootstrap: `ip_employer_requests`, `ip_users.form_approval_status` (`ensureIpRetireDeadQueuesSchema`).

Live employer onboarding = Domain / Free-email → Approvals only. Candidate register = Google path only (`path=form` → 410).

Employer email verify resend: `POST /api/ip/auth/employer-email-verify/resend` (login + post-register UI). Candidates do **not** use this verify gate.

Nav order: `src/lib/ipNav.js` → `SUPERADMIN_NAV`.

## Email unsubscribe queue (API)

| Path | Role |
|------|------|
| `GET` `/api/ip/superadmin/unsubscribe-requests` | List PENDING (and related) unsubscribe requests |
| Public `/unsubscribe?token=…` + `/api/ip/unsubscribe` | User click creates **PENDING** row — does **not** disable mail until ops process it |
| Libs | `src/lib/ipEmailUnsubscribe.js`, `ipEmailUnsubscribeFormat.js` |

There is **no** dedicated SuperAdmin page route for unsubscribe as of 2026-09-18 — consume via API / existing requests tooling. Confirm UI before inventing a page.

## Confirmed demo account (from `README.md`)

Bootstrap via `/api/ip/bootstrap` ensures: `support@placementhub.online` / `Admin@123`.  
Do not invent alternate admin roles.

## Constraints

- Separate login path from candidate/employer landing.
- Treat approval/document flows as sensitive; inspect API auth checks before changes.
- Migration `036_ip_single_superadmin.sql` encodes single-superadmin data repair — read before changing admin user model.

## Related domains

Auth, Employer (approvals), Database, UI/UX.

## Inspect before modifying

Superadmin page, matching API, and shared approval/document schema helpers.
