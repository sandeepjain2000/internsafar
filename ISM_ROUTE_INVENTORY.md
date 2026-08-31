# Route inventory — InternSafar / Internship Portal

**Last synced:** 2026-08-31 · verified against the working tree, not from memory
**App:** `internship-portal` (package name), product name **InternSafar**
**Roles:** exactly three — `candidate`, `employer`, `superadmin`
**Tables:** all `ip_*` (47 live tables — see [`docs/ip-er-diagram-notes.md`](docs/ip-er-diagram-notes.md))
**Companion:** [`ISM_USER_GUIDE.md`](ISM_USER_GUIDE.md) — behaviour, rules and demo scripts

> **Filename note.** `ISM_*` in these two filenames is historical. The earlier product in
> this workspace was "ISM" with `ism_*` tables and `/student` + `/admin` routes; none of
> that exists here. The filenames are kept only because they are already linked
> elsewhere. Everything below describes the current app.

**Totals:** 51 page routes · 6 layouts (root + `/account`, `/candidate`, `/employer`, `/ideas`, `/superadmin`) · 97 API route files (including the NextAuth catch-all).

**Counted from disk:**

- pages — every `page.js` under `src/app`
- APIs — every `route.js` under `src/app/api`, methods read from its `export async function` declarations

---

## How access is enforced (read this before trusting the Role column)

There is **no `middleware.js`** in this app. Protection is two-layered:

| Layer | Where | What it does |
|---|---|---|
| Client shell guard | `src/components/ip/PortalShell.jsx` | Unauthenticated → pushed to that role's login (`ROLE_LOGIN_HREF`); signed in with the **wrong** role → pushed to their own role home. Renders nothing while resolving. |
| Server checks | each API route | Session + role checked per request; this is the real boundary |

Because the page-level guard is client-side, **API routes are the security boundary**. Never treat a page path as protection.

Role homes (`src/lib/ipNav.js` → `ROLE_HOME`): candidate → `/candidate`, employer → `/employer`, superadmin → `/superadmin`.
Login targets (`ROLE_LOGIN_HREF`): candidate and employer → `/`, superadmin → `/superadmin/login`.

---

## Public / unauthenticated pages

| Route | Purpose |
|---|---|
| `/` | Landing + sign-in entry for candidate and employer |
| `/login` | Credentials sign-in |
| `/register` | Role chooser for signup |
| `/register/candidate` | Candidate self-registration |
| `/register/employer` | Employer self-registration (lands in the approval queue) |
| `/forgot-password` | Password-reset request |
| `/how-it-works` | Static explainer |
| `/guidelines` | Static posting/conduct guidelines |
| `/help` | Static help content |
| `/r/[code]` | Referral capture link — records the referrer, then sends the visitor into registration |
| `/app` | Router shim: signed in → role home, otherwise → login |
| `/superadmin/login` | Separate SuperAdmin sign-in surface (see the guide for why it is separate) |

## Candidate pages — 10 (plus 2 shared)

Layout `src/app/candidate/layout.js` · nav `CANDIDATE_NAV`

| Route | In sidebar as | Purpose |
|---|---|---|
| `/candidate` | Dashboard | Role home / summary |
| `/candidate/profile` | Profile | Profile, resume, photo, academics |
| `/candidate/internships` | Browse internships | Browse + filter + sort + apply |
| `/candidate/internships/[id]` | — | Posting detail |
| `/candidate/applications` | My applications | Application pipeline + withdraw |
| `/candidate/messages` | Messages | Thread list |
| `/candidate/messages/[id]` | — | Single thread |
| `/candidate/offers` | Offers | Accept / decline offers |
| `/candidate/referral` | Refer & earn | Referral code, points |
| `/candidate/notifications` | Notifications | Notification mailbox |
| `/ideas` (shared) | Feature ideas | Shared idea board |
| `/account` (shared) | Account | Shared account settings |

## Employer pages — 16

Layout `src/app/employer/layout.js` · nav `EMPLOYER_NAV`

| Route | In sidebar as | Purpose |
|---|---|---|
| `/employer` | Dashboard | Role home / summary |
| `/employer/profile` | Profile & docs | Company profile **and** verification documents |
| `/employer/internships` | Postings | Posting list by status |
| `/employer/internships/new` | — | Create a posting |
| `/employer/internships/[id]` | — | Applicant pipeline for one posting |
| `/employer/internships/[id]/edit` | — | Edit a posting |
| `/employer/candidates` | Search candidates | Candidate search / browse |
| `/employer/candidates/[id]` | — | **Full-page** candidate profile (replaced the old modal) |
| `/employer/messages` | Messages | Thread list |
| `/employer/messages/[id]` | — | Single thread |
| `/employer/offers` | Offers | Offers issued |
| `/employer/analytics` | Analytics | Funnel / performance |
| `/employer/rejection-templates` | Rejection templates | Reusable decline copy |
| `/employer/referral` | Refer & earn | Referral + points wallet |
| `/employer/notifications` | Notifications | Notification mailbox |
| `/employer/viral` | *not in sidebar* | Viral share / LinkedIn promotion surface |

## SuperAdmin pages — 12

Layout `src/app/superadmin/layout.js` · nav `SUPERADMIN_NAV`

| Route | In sidebar as | Purpose |
|---|---|---|
| `/superadmin` | Dashboard | Platform stats |
| `/superadmin/login` | *not in sidebar* | Dedicated sign-in |
| `/superadmin/form-registrations` | Form registrations | Self-signup approvals (`ip_users.form_approval_status`) |
| `/superadmin/approvals` | Employer approvals | Approve / reject / suspend employers |
| `/superadmin/requests` | Manual requests | Manual employer onboarding (`ip_employer_requests`) |
| `/superadmin/documents` | Documents | Review employer verification documents |
| `/superadmin/postings` | Postings | Posting oversight |
| `/superadmin/promotions` | LinkedIn promos | Review LinkedIn promotion claims |
| `/superadmin/viral` | Viral shares | Review viral share claims |
| `/superadmin/login-report` | Login report | Login/auth event report |
| `/superadmin/messages` | Messages | Message oversight |
| `/superadmin/feature-ideas` | Feature ideas | Triage submitted ideas |

## Shared authenticated pages

| Route | Roles | Purpose |
|---|---|---|
| `/account` | all three | Account settings (own layout `src/app/account/layout.js`) |
| `/ideas` | all three | Feature-idea board (own layout `src/app/ideas/layout.js`) |

---

## API surface — 97 route files

Methods below are exactly the handlers each file exports.

### Auth and registration

| Route | Methods |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth catch-all |
| `/api/auth/captcha` | GET |
| `/api/auth/captcha/verify` | POST |
| `/api/ip/auth/register-candidate` | POST |
| `/api/ip/auth/register-employer` | POST |
| `/api/ip/auth/change-password` | POST |
| `/api/ip/auth/password-reset/request` | POST |
| `/api/ip/auth/password-reset/confirm` | POST |
| `/api/ip/auth/2fa/resend` | POST |
| `/api/ip/auth/google-verification` | GET |
| `/api/ip/bootstrap` | POST |

### Account (all roles)

| Route | Methods |
|---|---|
| `/api/ip/account/profile` | GET, PATCH |
| `/api/ip/account/password-reset` | POST |
| `/api/ip/account/2fa` | GET, POST |
| `/api/ip/account/sessions` | GET, DELETE |
| `/api/ip/account/notification-preferences` | GET, PUT |
| `/api/ip/account/phone-change/request` | POST |
| `/api/ip/account/phone-change/verify` | POST |

### Candidate

| Route | Methods |
|---|---|
| `/api/ip/candidate/profile` | GET, PUT |
| `/api/ip/candidate/profile/resume/upload` | POST |
| `/api/ip/candidate/profile/photo/upload` | POST |
| `/api/ip/candidate/profile/email-change/request` | POST |
| `/api/ip/candidate/profile/email-change/verify` | POST |
| `/api/ip/candidate/academics` | GET, PUT |
| `/api/ip/candidate/internships` | GET |
| `/api/ip/candidate/internships/[id]` | GET |
| `/api/ip/candidate/applications` | GET, POST |
| `/api/ip/candidate/applications/[id]` | PATCH |
| `/api/ip/candidate/saved` | GET, POST |
| `/api/ip/candidate/export` | GET |

### Employer

| Route | Methods |
|---|---|
| `/api/ip/employer/dashboard` | GET |
| `/api/ip/employer/analytics` | GET |
| `/api/ip/employer/profile` | GET, PUT |
| `/api/ip/employer/profile/logo/upload` | POST |
| `/api/ip/employer/documents` | POST |
| `/api/ip/employer/documents/upload` | POST |
| `/api/ip/employer/internships` | GET, POST |
| `/api/ip/employer/internships/[id]` | GET, PUT, DELETE |
| `/api/ip/employer/internships/[id]/applicants` | GET |
| `/api/ip/employer/internships/[id]/applicants/bulk` | POST |
| `/api/ip/employer/internships/[id]/closure-summary` | GET |
| `/api/ip/employer/applications/[id]` | PATCH |
| `/api/ip/employer/applications/[id]/notes` | GET, POST |
| `/api/ip/employer/applications/[id]/events` | GET |
| `/api/ip/employer/candidates` | GET |
| `/api/ip/employer/candidates/[id]` | GET |
| `/api/ip/employer/candidates/[id]/invite` | POST |
| `/api/ip/employer/lists` | GET, POST, DELETE |
| `/api/ip/employer/saved-views` | GET, POST, DELETE |
| `/api/ip/employer/rejection-templates` | GET, POST, PUT, DELETE |
| `/api/ip/employer/reminders` | GET, POST |
| `/api/ip/employer/export` | GET |
| `/api/ip/employer/export-jobs/[id]` | GET |

### SuperAdmin

| Route | Methods |
|---|---|
| `/api/ip/superadmin/stats` | GET |
| `/api/ip/superadmin/employers` | GET |
| `/api/ip/superadmin/employers/[id]` | PATCH |
| `/api/ip/superadmin/requests` | GET, POST, PATCH |
| `/api/ip/superadmin/form-registrations` | GET, PATCH |
| `/api/ip/superadmin/documents` | GET, PATCH |
| `/api/ip/superadmin/postings` | GET, PATCH |
| `/api/ip/superadmin/login-report` | GET |
| `/api/ip/superadmin/export-audit` | GET |
| `/api/ip/superadmin/feature-ideas/[id]` | PATCH |

### Cross-role features

| Route | Methods | Notes |
|---|---|---|
| `/api/ip/offers` | GET, POST | Employer creates; candidate reads |
| `/api/ip/offers/[id]` | PATCH | Accept / decline / withdraw |
| `/api/ip/offers/[id]/remind` | POST | Nudge a pending offer |
| `/api/ip/messages/threads` | GET, POST | |
| `/api/ip/messages/threads/[id]` | GET, PATCH, POST | |
| `/api/ip/messages/threads/[id]/attachment` | POST | |
| `/api/ip/notifications` | GET, PATCH | Mailbox for all roles |
| `/api/ip/nav-badges` | GET | Sidebar unread counts |
| `/api/ip/completions` | POST | Mark an internship completed |
| `/api/ip/endorsements` | GET, POST | |
| `/api/ip/ratings` | GET, POST | |
| `/api/ip/referral` | GET | |
| `/api/ip/referral/lookup` | GET | Resolves `/r/[code]` |
| `/api/ip/points/ledger` | GET | |
| `/api/ip/points/convert` | POST | |
| `/api/ip/viral` | GET, POST | |
| `/api/ip/viral/[id]` | PATCH | SuperAdmin review |
| `/api/ip/viral/process-due` | POST | Scheduled processing |
| `/api/ip/promotions` | GET, POST | LinkedIn promotions |
| `/api/ip/promotions/[id]` | PATCH | SuperAdmin review |
| `/api/ip/ideas` | GET, POST | |
| `/api/ip/ideas/[id]/vote` | POST | |
| `/api/ip/ideas/[id]/comments` | GET, POST | |
| `/api/ip/ideas/[id]/follow` | POST | |
| `/api/ip/idea-categories` | GET, POST | |
| `/api/ip/profile-reminder` | GET, POST | Drives the profile-completion banner |
| `/api/ip/files` | GET | Signed/streamed file access |

### Filters, sort and saved presets

| Route | Methods | Backing table |
|---|---|---|
| `/api/ip/table-filter-prefs` | GET, PUT | `ip_table_filter_prefs` — last-used filters **and** sort, per user per `table_key` |
| `/api/ip/list-presets` | GET, POST, PATCH, DELETE | `ip_saved_applicant_views` — named presets, any screen, either role |
| `/api/ip/employer/saved-views` | GET, POST, DELETE | `ip_saved_applicant_views` — original employer-applicant entry point |

**Naming trap:** `/api/ip/list-presets` is **not** backed by a `ip_list_presets` table. That table was dropped in migration `022`; presets were consolidated onto `ip_saved_applicant_views` by migration `021`. The route name is legacy.

### Lookup / cron / test hooks

| Route | Methods | Notes |
|---|---|---|
| `/api/ip/ref/cities` | GET | `ip_ref_cities` |
| `/api/ip/ref/degrees` | GET | `ip_ref_degrees` |
| `/api/ip/cron/schedule-reminders` | POST | Scheduled job |
| `/api/ip/cron/export-jobs` | POST | Scheduled job |
| `/api/ip/qa/arm-login-db-failure` | POST | **Test hook** — arms a simulated login DB failure for the QA suite. Not a product feature |

---

## Routes that do NOT exist (do not link to these)

Verified absent; two of these were live as notification links until 2026-08-31 and were repointed:

| Wrong path | Use instead |
|---|---|
| `/employer/documents` | `/employer/profile` (documents live there) |
| `/employer/templates` | `/employer/rejection-templates` |
| `/student/*`, `/admin/*` | Previous product; roles are `candidate` / `superadmin` here |
| `/employer/company`, `/employer/users`, `/employer/plans`, `/employer/participation` | Previous product; no equivalents |
| `/demo-accounts`, `/*/preferences`, `/*/cases/*`, `/*/alerts`, `/*/saved` | Previous product |

`npm run audit:demo-consistency` includes a check that walks `src/app` and fails if any
`ip_notifications.link` value does not resolve to a real page route, so this class of
error cannot silently return.

---

## Maintenance

Regenerate the page and API lists from disk rather than editing by hand:

- pages — enumerate `page.js` under `src/app`
- API methods — grep `export async function (GET|POST|PUT|PATCH|DELETE)` in each `route.js`

On Windows PowerShell, note that `[id]` in a path is a wildcard — use ripgrep or `-LiteralPath`, or dynamic routes silently return no matches.
