# Domain: SuperAdmin

## Responsibility

Platform oversight: employer approvals, manual requests, documents, postings, promotions, viral, login report, form registrations, feature ideas, messages, bootstrap.

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
| `/superadmin/form-registrations` | Form registrations |
| `/superadmin/approvals` | Employer approvals |
| `/superadmin/requests` | Manual requests |
| `/superadmin/documents` | Documents |
| `/superadmin/postings` | Postings oversight |
| `/superadmin/promotions` | LinkedIn promos |
| `/superadmin/viral` | Viral shares |
| `/superadmin/login-report` | Login report |
| `/superadmin/messages` | Messages |
| `/superadmin/feature-ideas` | Feature ideas |

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
