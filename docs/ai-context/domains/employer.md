# Domain: Employer

## Responsibility

Employer dashboard, profile/docs, internship postings, candidate search/workbench, messages, offers, analytics, referrals (points earned includes posting-share rewards), rejection templates.

## Central sources

| Path | Role |
|------|------|
| `src/app/employer/**` | Pages |
| `src/app/api/ip/employer/**` | Employer APIs (dashboard, internships, applicants, candidates, notes/events, exports, reminders, lists, saved-views, documents) |
| Shared APIs | messaging / offers / files / ratings / endorsements as used by workbench |
| Docs | `WORKBENCH_FEATURE_GUIDE.md`, `WORKBENCH_IMPLEMENTATION_REPORT.md` |
| Helpers | `src/lib/ipEmployer*.js`, `ensureIpWorkbenchSchema.js`, export/reminder scripts |

## Pages (confirmed)

| Route | Purpose |
|-------|---------|
| `/employer` | Dashboard |
| `/employer/profile` | Profile & docs |
| `/employer/internships` | Postings list |
| `/employer/internships/new` | Create posting |
| `/employer/internships/[id]` | Posting detail / workbench |
| `/employer/internships/[id]/edit` | Edit posting |
| `/employer/candidates`, `/employer/candidates/[id]` | Search / detail |
| `/employer/messages`, `/employer/messages/[id]` | Messaging |
| `/employer/offers` | Offers |
| `/employer/notifications` | Notifications |
| `/employer/analytics` | Analytics |
| `/employer/rejection-templates` | Templates |
| `/employer/referral` | Refer & earn (+ posting-share reward rows in points earned) |
| `/employer/viral` | Redirect → `/employer/referral` (legacy) |

Nav order: `src/lib/ipNav.js` → `EMPLOYER_NAV`.

## List UX (confirmed 2026-09-18)

Offers, notifications, and message panes use shared `IpListPager` — same component as candidate lists. Prefer it over a one-off pager.

Candidate search (`/employer/candidates`) filters include **Region** (UI label; query `region`; matches candidate `country`) ahead of city — see `src/lib/ipRegions.js`. Employer profile **HQ Country** uses the same searchable multi-select control (stores one value).

## Constraints

- Role home is `/employer`.
- Publishing / points / ethics rules live in lib — inspect before changing posting flows.
- Do not invent workbench columns or pipeline statuses; read current helpers + migrations.

## Related domains

Auth, Database, Workflow-core, SuperAdmin (approvals), UI/UX.

## Inspect before modifying

Page + API + workbench/lib helpers. For schema changes: migrations + migrate gates.
