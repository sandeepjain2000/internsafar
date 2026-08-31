# Internship Portal (InternSafar) - Full User & Ops Guide

**Document type:** Source of truth for humans and for AI assistants.  
**Scope:** Code in `internship-portal` only (this folder).
**Package name:** `internship-portal`
**Roles:** exactly three - `candidate`, `employer`, `superadmin`.
**Last synced:** 2026-08-31, verified against the live route files, API handlers and DB migrations 001-035.

> The `ISM_` filename prefix is legacy. The product this file documents is the Internship
> Portal (InternSafar), whose tables are all prefixed `ip_`. An older version of this file
> described a different product ("Internship Management System", `ism_*` tables, roles
> student/employer/admin, package `employer-student-internship`). None of that applies.
> If you find `ism_*` or a `student` role anywhere, it is stale.

### Instructions for AI readers (mandatory)

1. Treat this document as the authoritative description of what the Internship Portal does.
2. Do not invent features, roles, pages, payments, or college-admin workflows not listed here.
3. Anything in section 12 (Known defects and limits) is **not working** or **not implemented** - say so.
4. Prefer citing exact routes, labels and status values from this guide.
5. Demo credentials in section 2 are seed accounts for QA only.

### Companion documents

| Document | Contents |
|---|---|
| `ISM_ROUTE_INVENTORY.md` | Every page route, layout and API route with HTTP methods |
| `docs/ip-er-diagram.puml` | Logical ER diagram (PK/FK per table) |
| `docs/ip-er-diagram-notes.md` | Table-by-table notes, core vs non-essential |
| `scripts/SCRIPTS-README.md` | What each script does |
| `scripts/IP_TEST_DATA_GUIDE.md` | Seeding, reset and coverage workflow |
| `qa/docs/QA-DOCS-README.md` | QA suite documentation |
| `InternSafar_Business_Requirements.txt` | Business requirements |
| `WORKBENCH_FEATURE_GUIDE.md` | Recruiter workbench features |

---

## 1. How to run

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js app on http://localhost:3000 (webpack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:migrate:ip` | Base schema |
| `npm run db:migrate:workbench` | Migrations 016-027 |
| `npm run db:migrate:company-names` | Migrations 032-034 (one-time company-name repair) |
| `npm run db:migrate:candidate-academics` | Migration 035 (demo education history) |
| `npm run generate:ip-test-data` | Bulk demo data |
| `npm run fill:core-coverage` | Top every list up to the 11-row demo target |
| `npm run audit:core-coverage` | Confirm every tab/queue has demo depth |
| `npm run audit:demo-text` | Detect machine-generated text in visible columns |
| `npm run audit:demo-consistency` | 47 cross-field consistency checks |
| `npm run db:check-integrity` | FK / pipeline integrity |
| `npm run qa:e2e` | Playwright suite |

`POST /api/ip/bootstrap` runs on the sign-in pages and performs idempotent schema
ensures plus guarantees the SuperAdmin account exists.

---

## 2. Accounts and sign-in

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Candidate | `lawsonlclintern+1@gmail.com` | `Admin@123` |
| Employer (Nova Labs) | `placementhubsupport@gmail.com` | `Admin@123` |
| SuperAdmin | `support@placementhub.online` | `Admin@123` |

These three are the protected core accounts (`scripts/lib/ipCoreSampleConfig.js`). Every
seeding, reset, deletion and QA script refuses to delete or rename them. Two extra
candidate logins (`lawsonlclintern+2/+3@gmail.com`) and a pending employer
(`placementhubsupport+3@gmail.com`, Pulse Media) exist for multi-account scenarios.

### Where you sign in

- `/` is the real sign-in page. `/login` is only a redirect to `/` preserving the query string.
- `/superadmin/login` is a separate, red-themed page for the same credentials provider. After
  sign-in it re-reads the session and refuses to forward anyone whose role is not
  `superadmin` ("This account is not a SuperAdmin account.").
- `/app` is a dispatcher: signed in goes to the role home, otherwise to `/`.
- Role homes: candidate `/candidate`, employer `/employer`, superadmin `/superadmin`.
- Sign-out returns candidates and employers to `/`, superadmins to `/superadmin/login`.

### Session mechanics

Sessions are NextAuth **credentials only**; Google can never create a session (see 3.3).
Strategy is JWT. The cookie ceiling is 30 days but the JWT callback enforces **12 hours**
unless "Remember this device for 30 days" was ticked. Role, `active` and `profile_complete`
are re-read from the database on every token refresh, so deactivating a user or changing a
role takes effect without a re-login. A revoked device session empties the session.

Every attempt writes to `ip_login_events` with IP, user agent, auth method and, on failure,
a reason (`Unknown account`, `Inactive account`, `Bad Pass`, or the Google refusal).

### Captcha

A simple arithmetic captcha (`GET /api/auth/captcha`, HMAC token, 10-minute TTL) is required
on: the landing login, `/superadmin/login`, candidate registration, the employer form/manual
path, and forgot-password. It is **not** required on the employer domain path (which relies
on Google verification) or on any signed-in action. In development (`NODE_ENV !== 'production'`)
or with `DUMMY_CAPTCHA=true` the question is fixed at `3 + 4 = 7`.
`CAPTCHA_BYPASS_FOR_TESTING` disables it entirely.

### Two-factor authentication

Optional per account, email OTP only, enabled from `/account`. Codes are 6 digits, SHA-256
hashed, valid 10 minutes. 2FA triggers only **after** password and captcha pass: the
authorize step throws `TWO_FACTOR_REQUIRED:<challengeId>` and creates no session; the landing
page swaps to an OTP step ("Verify & continue", "Resend code", "Back to password").

### Password rules (they differ by entry point)

| Path | Rule |
|---|---|
| Candidate form registration | at least 8 characters |
| Employer manual request | at least 8 characters |
| Reset via emailed link | at least 8 characters |
| Signed-in change (`/account`) | at least 8, plus 1 uppercase, 1 digit, 1 special |

bcrypt cost 10 everywhere. Reset tokens are single-use with a 1-hour TTL. The
forgot-password request endpoint always answers "If that email is registered, a reset link
has been sent." and only issues tokens for active users. **See defect 12.1 before relying on
the emailed reset link.**

---

## 3. Registration

### 3.1 Candidate - `/register/candidate`

Gmail only: `@gmail.com` or `@googlemail.com`. Anything else is rejected with "Only personal
@gmail.com or @googlemail.com addresses are allowed for candidate registration." and the
submit button disables.

Two paths:
- **Google path (default).** Consumes a Google verification token; the typed email must equal
  the verified Google email. Creates an **active** account, emails a 12-character temporary
  password, stores `registration_source='google'` (or `gmail_domain` when the QA captcha
  bypass skipped real OAuth). Referrer is credited immediately.
- **Form path.** Requires university, graduation year, password, captcha. Creates
  `active=false` with `form_approval_status='pending'`, notifies SuperAdmin, and returns
  `mode:'form_pending'`. The referral is only *pending* until approval.

Both grant 50 points and an application allowance of 10.

### 3.2 Employer - `/register/employer`

Business entity type is mandatory: Professional, Partnership Firm, LLP, Private Limited,
Public Firm. Two paths:

- **Domain path.** Requires a website and a work email whose domain matches it exactly,
  rejects consumer mailbox domains, and requires a Google token on the same company domain
  (not necessarily the same address). Creates the user active with 50 points and 1 free post
  credit, sets `ip_employers.approval_status='pending'`, emails a temporary password and
  notifies SuperAdmin at `/superadmin/approvals`.
- **Manual/form path.** Stores a row in `ip_employer_requests` only - no account exists until
  SuperAdmin approves. Notifies SuperAdmin at `/superadmin/form-registrations`.

An employer created by SuperAdmin approving a manual request is **approved immediately**,
unlike the self-serve domain path which starts pending.

### 3.3 Google's role

Google is **registration verification only**. The `signIn` callback mints a single-use
verification token when a registration intent cookie is present; without one it logs a failed
login event and redirects to `/?error=GoogleLoginDisabled`. The JWT callback additionally
hard-fails any Google account, so Google can never produce a portal session.

### 3.4 Referral entry

`/r/{code}` redirects to `/register?ref=<code>`. `/register` shows "Referral code applied"
and forwards `?ref=` to both role forms. Invalid or self-referral codes are silently ignored
(and logged), never rejected.

---

## 4. Candidate role

Nav: Dashboard, Profile, Browse internships, My applications, Messages, Offers, Refer & earn,
Notifications, Feature ideas, Account. The sidebar badge shows unread notifications only.

### 4.1 `/candidate` - Dashboard

"Welcome, {name}". Shows up to 2 pending actions (pending offers, upcoming interviews), six
feature tiles, three stat cards (Reward points with "5 pts/app = N applications left",
Applications sent, Internships Completed), a Profile Readiness panel (13-point completion),
Recommended for you (match >= 85), Saved internships, and Ratings received.

### 4.2 `/candidate/internships` - Browse

Tabs: All Internships (count), Saved Internships (count), Recommended for You.
Quick chips: All listings, Starting soon (start within 21 days), Saved, Recently updated
(7 days), Verified employers (employer approved).
Filters: Work Mode, Minimum Monthly Stipend, Work location (city), Candidate Match %,
Min Validation Score.
Sort: Best Match Score, Highest Stipend, Newest Listed, Earliest Start Date, Fewest
Applicants (Best Odds).
Card button: "Review & Apply (5 Pts)"; already-applied shows a static "Applied".

Visibility rule: `status='published'` and now within `starts_at` / `apply_ends_at`, hard
`LIMIT 200`.

**Privacy rules enforced server-side:**
- Employers with `show_employer_identity=false` display as "Confidential employer".
- Raw applicant counts are never sent to the client. Only a bucketed
  `application_volume_label` (`50+`, `100+`, `200+`, `500+`, `1,000+`, `2,000+`) is returned,
  and only when the employer has `show_hiring_numbers`. Below 50 the label is null (hidden).
  The exact count is still used internally for the "Fewest Applicants" sort.

**Mobile view:** pure CSS, no user-agent or JS check. Both layouts render and a single
`@media (max-width: 767px)` block switches to the phone layout (edge-to-edge cards, filters
as a bottom sheet). This applies to `/candidate/internships` only.

### 4.3 `/candidate/internships/[id]` - Detail and apply

Alert "Application cost - Each apply costs 5 points (you have N)." An incomplete profile
shows a warning but does **not** block applying. Screening questions render as radio (mcq),
textarea or text.

**Apply rules, in order (`POST /api/ip/candidate/applications`):**
1. Candidate session required.
2. Internship must exist and be candidate-accessible, else 404.
3. Required screening answers validated server-side; MCQ answers must match a real option.
   Max 5 questions per posting. An employer-configured trigger option sets
   `screening_disabled` on the application but the apply still succeeds.
4. Duplicate apply: 409 "You already applied to this internship".
5. Needs 5 points, else 403.
6. Capacity: advisory-locked cap of **100 active applications per posting** (active = any
   status except rejected and withdrawn), else 409.
7. In one transaction: debit 5 points, ledger row `application_spend`, insert application
   with status `applied`, insert an `applied` event.
8. First application ever earns a 10-point bonus. Employer and candidate are both notified.

### 4.4 `/candidate/applications`

Tabs: All Applications, Applied, Under Review, Interview Scheduled, Offer Received, Rejected,
Withdrawn. Columns: Role, Employer, Stipend, Location, Applied, Status, Next, Actions.
Page size 10. Sort: Latest First, Oldest First, Status, Highest match.

Withdraw is offered only for status `applied` or `pending` and calls
`PATCH /api/ip/candidate/applications/{id}` with `{status:'withdrawn'}` - the only value the
API accepts, scoped to the caller's own candidate id. See defect 12.2.

### 4.5 `/candidate/offers`

Tabs: All Offers, Action Required, Accepted, Declined, Expired. Pending offers show
"Decline Offer" / "Accept Offer" with a confirm dialog. Accepted offers reveal onboarding
instructions, HR contact, mentor and a "Rate employer" action.

Respond via `PATCH /api/ip/offers/{id}` with `accepted` or `declined` only. Rejected if the
offer has expired or is not currently `pending`. Accept sets the application to `hired`;
decline sets `declined_offer`. Both notify and email the employer. Date-only `valid_until`
values expire at 23:59:59.999 local.

### 4.6 Other candidate pages

- `/candidate/messages` - shared split pane. Employers start threads; candidates reply.
  Interview and offer banners appear contextually. Archived threads block sending.
  Attachments: PDF/JPEG/PNG/WEBP/GIF.
- `/candidate/messages/[id]` - redirect to `?thread={id}`.
- `/candidate/notifications` - 11 filters, mark one or all read, max 500 rows.
- `/candidate/referral` - referral link (`/register/candidate?ref=CODE`) and viral link
  (`/r/CODE`), points ledger with running balance, referral history with masked identities.
- `/candidate/profile` - 5 tabs: Basics & Contact, Academic & Skills, Work Readiness,
  Privacy & Photo, Endorsements (read-only). The first three are a sequenced wizard; later
  steps unlock via "Save & Next". Multi-row education history lives in
  `ip_candidate_academics`; row 0 mirrors into the flat `ip_candidates` columns on save.
  Work experience is stored as a **JSON string** in `ip_candidates.prior_experience` and is
  rendered through `src/lib/ipCandidateExperience.js` (never as raw JSON).
  `profile_complete` requires name, college, degree, city, country and resume_url; phone is
  optional. Export: "Export Candidate Profile Data (.csv)" produces PROFILE, APPLICATIONS and
  OFFERS blocks.

**Phone privacy:** `hide_phone_until_shortlist` defaults to true and is enforced server-side.
Employers see the number only when the application status is `interviewing`, `offered`,
`hired` or `completed`.

---

## 5. Employer role

Nav: Dashboard, Profile & docs, Postings, Search candidates, Messages, Offers, Analytics,
Rejection templates, Refer & earn, Notifications, Feature ideas, Account.
`/employer/viral` redirects to `/employer/referral`.

### 5.1 Gating - what an employer must do before posting

`POST /api/ip/employer/internships` refuses unless:
1. `ip_users.profile_complete` is true, else 403 "Complete your employer profile before posting".
2. `ip_employers.approval_status = 'approved'`, else 403 "Your employer account must be
   approved by SuperAdmin before posting".
3. Title present; screening questions and schedule valid.
4. For any status other than `draft`, 50 points are debited first; insufficient balance gives
   403 ending "Or save as draft."

Profile completeness requires company_name, website, work_email, industry, hq_city,
contact_name, contact_phone, business_entity_type **and** all 6 ethics acknowledgements.

### 5.2 `/employer/internships` - Postings

Status filter: All, Active, Paused, Draft, Closed. Badges: Live, Scheduled, Closing soon
(within 48h), Paused, Closed, Draft. Page size 10.

Row actions: Edit, Pause (published only), Activate (paused/draft - **this recharges 50
points**), Repost/Duplicate (closed or expired - creates an unpaid draft with dates cleared),
Promote + verify (LinkedIn), Share on WhatsApp / LinkedIn.

Create and edit use tabs: Details, Schedule, Hours & engagement, Compensation, Eligibility
(create only), Screening. The posting quality checklist is advisory and never blocks.

### 5.3 `/employer/internships/[id]` - Applicant pipeline

Columns: checkbox, Candidate, History, Match, Answers, Comm, Status, Actions.
Filters: search, status, min match %, screening state, list, unread, responded, screening
question and answer, min total/completed/ongoing internships. Sort: Best match, Newest,
Name A-Z, Status. Page size 20.

The candidate name links to the **full page** `/employer/candidates/{id}` - there is no
modal. Row actions move status, send an offer, or toggle Compare (max 4). Choosing
`interviewing` opens a schedule dialog requiring a date/time and validating the meet URL.

Bulk bar (max 100 ids per call): Shortlist, Reject (optional templated message), Message
(with `{{candidate_first_name}}` / `{{internship_title}}` personalization and preview), Add
to list, Export CSV/ZIP. Every id must belong to a posting this employer owns.

Employer lists are capped at **5 per employer**; duplicate names give 409.

Applicant export goes background when resumes are included and more than 3 rows, or more
than 15 rows without resumes; the job is polled from `/api/ip/employer/export-jobs/{id}`.
ZIPs contain `applicants.csv`, `README.txt` and `resumes/`, and exclude hidden phone numbers.

### 5.4 `/employer/candidates` - Search

Only candidates with `searchable = true` are returned. Match % is computed only when a
posting is selected and that posting has eligibility criteria. Sort: Best role match,
Recently updated, Availability, Most experience.

Actions: View profile, Make offer (only if they already applied), Invite to apply. Invite
returns 409 "This candidate already applied - do not send a duplicate invite." or
"Invitation already sent for this internship."

`/employer/candidates/[id]` shows Profile, This application (with screening answers resolved
against the question snapshot), Private notes, Timeline and Follow-up reminder. Email and
resume are deliberately not shown in this view; phone shows "Hidden until shortlist/interview"
when masked.

### 5.5 `/employer/offers`

Tabs: All, Pending, Accepted, Declined. Row actions: View Letter, Remind (pending only), and
for accepted offers Endorse and Rate. Remind is blocked when non-pending, expired, or within
a 24-hour cooldown (429).

**Offer rules:** employer role only; needs an `applicationId` or `candidateId + internshipId`;
without an existing application it returns 400 "Offer requires an existing application. The
candidate must apply first."; one offer per application (409, enforced by a unique index).
Creating an offer flips the application to `offered`.

### 5.6 Other employer pages

- `/employer/analytics` - funnel, college/degree mix, geography, specialization, eligibility
  fit, stipend vs market. Explicitly advisory: "never blocks candidates or hiring decisions."
- `/employer/rejection-templates` - own plus system templates; PUT bumps `version`; system
  templates cannot be edited or deleted.
- `/employer/referral` - prefers the viral link `/r/{code}`; verified means referral status
  `completed`.
- `/employer/profile` - Company Details, Contact & Location, About & Visibility, Guidelines &
  Ethics, Verification Documents (optional). Document types: Shop Act, LLP registration,
  Business PAN, Other. Uploads accept PDF/JPEG/PNG/WEBP/GIF, max 8 MB, magic-byte sniffed.
- `/employer/notifications`, `/employer/messages` - shared surfaces.

### 5.7 Points

`POINTS_PER_POST = 50`, `REFERRAL_POINTS = 25`, `LINKEDIN_PROMO_POINTS = 30`,
`POINTS_PER_APPLICATION = 5`, `PROFILE_COMPLETE_POINTS = 15`, `FIRST_APPLICATION_BONUS = 10`.

Employers spend 50 per publish or republish (ledger `posting_spend`) and earn 50 at domain
signup, 25 per verified referral, and 30 per SuperAdmin-verified LinkedIn promotion.

---

## 6. SuperAdmin role

Nav: Dashboard, Form registrations, Employer approvals, Manual requests, Documents, Postings,
LinkedIn promos, Viral shares, Login report, Messages, Feature ideas, Account.
Every `/api/ip/superadmin/**` route starts with a superadmin session check (401 or 403).

### 6.1 `/superadmin` - Dashboard

Four metric cards plus an "Operations Triage Hub" table (Operational Area, Description, Queue
Status, Action) linking to each queue. "Export System Audit Log" downloads
`superadmin-system-audit-<date>.csv` with sections for the summary and every pending queue
plus recent login events (200 rows per section).

Note: "Offers & Hiring Audits" links to `/superadmin/approvals` - there is no dedicated
offers page.

### 6.2 `/superadmin/approvals` - Employer approvals

Tabs: Pending, Approved, Rejected. Metrics include Avg Triage Speed. Risk tags derive from
comparing the email domain to the website domain: Verified Corporate, Domain Mismatch, Edu
Account, Review Domain, No email.

`PATCH /api/ip/superadmin/employers/{id}` accepts `approved`, `rejected`, `suspended`,
`pending`, supports bulk `ids`, stamps `approval_reviewed_at`, and sets `rejection_reason`
only when rejecting. Reject presets: Incomplete Document Upload, Unverified Domain,
Incorrect Company Details, Other. A reason is required.

**Important:** this endpoint changes only `ip_employers.approval_status` plus reason and
timestamp. It does not deactivate the login and does not touch their postings - posting
visibility is changed separately from `/superadmin/postings`.

### 6.3 `/superadmin/documents`

Tabs All / Pending / Approved / Rejected, filtered by document type. The DB values are
`pending`, `approved`, `flagged`; the UI displays `flagged` as "rejected" and maps an
incoming `rejected` back to `flagged`. Approving or rejecting notifies the employer with a
link to `/employer/profile`. Document review is independent of employer approval - posting is
gated on `approval_status` only.

### 6.4 `/superadmin/postings` - Moderation

Tabs All / Live Published / Paused / Taken Down (`closed`). Actions: Publish, Pause, Take
down (with an optional reason; note "Taking down this posting removes it from candidate
search immediately"), plus bulk pause and publish. Every change notifies the employer with
"Posting moderation update" linking `/employer/internships`.

### 6.5 `/superadmin/requests` - Manual employer requests

Status: pending, approved, rejected. **Approving creates the account** in one transaction:
`ip_users` with role employer, 50 points, 1 free post credit,
`registration_source='form'`, active; and `ip_employers` with `approval_status='approved'`.
409s guard "Request already processed" and "An account with this email already exists". The
applicant's chosen password hash is reused if present, otherwise a 12-character password is
generated and emailed. Rejecting works only from pending and emails the reason.

### 6.6 `/superadmin/form-registrations`

Scope is strictly `role='candidate' AND registration_source='form'`. Tabs: Candidates,
Employers, Approved Log. `form_approval_status` is pending, approved or rejected.
Approving sets `active=true` and credits any pending referral; rejecting sets `active=false`
and invalidates the referral with reason `registration_rejected` (no email on reject).

Login-time consequence: a pending form registration cannot sign in ("Your registration is
pending SuperAdmin approval."), and a rejected one gets "Your registration was rejected."

### 6.7 `/superadmin/feature-ideas`

Statuses: Pending approval, Under review, Planned, In progress, Shipped (shown as
"Completed"), Declined. Priority is stored numerically (P0=1, High=2, Medium=3, Low=4).
Patchable fields: status, priority, categoryId, adminNote. The author and every follower are
notified on a status change, or of "an update on an idea you follow" when only the note
changed.

### 6.8 `/superadmin/login-report`

Ranges: Last 24 Hours, Last 7 Days, Last 30 Days, All time. Metrics include Active Sessions
(seen in the last 30 minutes) and success rate. Rows come from `ip_login_events` (500 max)
enriched with a device label and an auth label that appends the failure reason.

### 6.9 `/superadmin/messages`, `/superadmin/promotions`, `/superadmin/viral`

Messages is built on the shared notifications API; its category buckets are keyword/link
heuristics, not a database column. Promotions and viral shares share a seven-value status set
(`pending`, `scheduled`, `searching`, `fast_track_pending`, `verified`, `rewarded`, `failed`);
verifying a promotion credits 30 points and ends at `rewarded`, failing sets `failed` with
review notes.

---

## 7. Shared surfaces

### 7.1 `/account` (all roles)

Tabs: Security & Password, Profile Info & Contact, Active Sessions, and Notification
Preferences (candidates only).

- Password change requires the current password and the strict 4-part rule; an optional
  checkbox (default on) revokes all other device sessions.
- 2FA enable/disable via emailed OTP; 503 when mail is unconfigured.
- Profile tab changes **the display name only** - email is identity and cannot change here.
  Candidates additionally get Change Email (code to the new address) and Change Phone (code
  emailed to the login address, because SMS is not configured).
- Sessions lists up to 50 live sessions; you can revoke others but not the current one
  ("use Sign out").
- Notification preferences store In-App / Email / SMS per row, but the API always returns
  `smsDelivery:false` with a note that SMS cannot be sent until a carrier is connected.

### 7.2 `/ideas` - Feature ideas board

Readable by all three roles. Submitting and voting are **candidate and employer only** -
superadmins cannot post or vote, only triage and comment. Voting is a toggle, so effectively
one vote per account. Comments are capped at 2000 characters; superadmin comments render as
"Product team". Following an idea subscribes you to status changes. Default categories:
Applications, Notifications, AI & Tools, Referrals, UI/UX, General.

### 7.3 Filters, sort and saved views

Two layers, both scoped per user and per `tableKey`:

1. **Last-used filters and sort** - `GET/PUT /api/ip/table-filter-prefs`, stored in
   `ip_table_filter_prefs`, debounced 450 ms, hydrated on mount.
2. **Named presets** - `/api/ip/list-presets`, stored in `ip_saved_applicant_views`, **max 5
   per list** ("You already have 5 saved views for this list. Delete one to save another."),
   duplicate names rejected, one exclusive default per list. A default preset overrides the
   last-used prefs on load.

Table keys in use: `candidate.internships`, `candidate.applications`, `candidate.offers`,
`candidate.notifications`, `candidate.referral`, `candidate.messages`, `employer.internships`,
`employer.applicants.{internshipId}`, `employer.candidates`, `employer.offers`,
`employer.referral`, `employer.notifications`.

Card/list view mode is **not** server-persisted - it lives in localStorage only.

### 7.4 Public pages (no sign-in)

`/how-it-works` (four steps: employer registers, candidate registers, approvals and profile,
then post/apply/message/hire), `/guidelines` (renders `POSTING_GUIDELINES` from
`src/lib/ipConstants.js` as the confirmations an employer must accept), and `/help` (four
topics: signing in, employer verification, messaging, guidelines and ethics - it states
plainly that there are no live support tickets).

### 7.5 Cron and QA endpoints

`POST /api/ip/cron/export-jobs` drains up to 20 queued export jobs; `POST
/api/ip/cron/schedule-reminders` runs the reminder sweep. Both authenticate the same way: if
`IP_CRON_SECRET` is set, the `x-ip-cron-secret` header must match, otherwise they fall back to
accepting an employer or superadmin session. `POST /api/ip/qa/arm-login-db-failure` returns 404
unless `IP_QA_ROUTES_ENABLED=true`; it arms a one-shot simulated database failure consumed by
the next login, used to test the sign-in retry path.

### 7.6 Outbound email override

Gate: `ISM_TEST_ENVIRONMENT` (alias `OUTBOUND_EMAIL_OVERRIDE_ENABLED`) must be exactly
`true`, `1`, `yes` or `on`. The address alone never redirects mail.

When the gate is on, mail is sent to the **real recipient plus** the override address in one
message, with a "QA mail copy" banner - the real recipient is never dropped. When off, mail
goes only to the real recipient. On a send failure a fallback address is used and the retry
*redirects*, prefixing the subject with `[for <intended>]`.

Transport: ZeptoMail first when configured, SMTP as backup, otherwise `MAIL_NOT_CONFIGURED`
(surfaced as 503 by the 2FA and reset endpoints).

---

## 8. Status enums (authoritative)

| Thing | Values |
|---|---|
| `ip_applications.status` | `applied`, `shortlisted`, `interviewing`, `offered`, `hired`, `completed`, `rejected`, `declined_offer`, `withdrawn` (DB CHECK) |
| `ip_internships.status` | `draft`, `published`, `paused`, `closed` (`closed` displays as "takedown") |
| Posting lifecycle labels | Draft, Paused, Closed, Expired, Archived, Scheduled, Closing soon, Live |
| `ip_offers.status` | `pending`, `accepted`, `declined`, `expired` |
| `ip_employers.approval_status` | `pending`, `approved`, `rejected`, `suspended` |
| `ip_employer_requests.status` | `pending`, `approved`, `rejected` |
| `ip_employer_documents.review_status` | `pending`, `approved`, `flagged` (UI: "rejected") |
| `ip_users.form_approval_status` | `pending`, `approved`, `rejected` (null for non-form) |
| `ip_feature_ideas.status` | `Pending approval`, `Under review`, `Planned`, `In progress`, `Shipped`, `Declined` |
| Promotions / viral shares | `pending`, `scheduled`, `searching`, `fast_track_pending`, `verified`, `rewarded`, `failed` |
| `registration_source` | `google`, `gmail_domain`, `form`, `domain` |
| Referral status | `pending`, `completed`, `invalid` |
| Export job status | `pending`, `processing`, `done`, `failed` |

Candidate-facing application labels: applied/pending show as "Applied", `shortlisted` as
"Under Review", `interviewing` as "Interview Scheduled", `offered` as "Offer Received",
`declined_offer` as "Offer Declined".

---

## 9. Hard numeric limits

| Limit | Value |
|---|---|
| Points per application | 5 |
| Points per posting publish | 50 |
| Active applications per posting | 100 |
| Screening questions per posting | 5 |
| Saved presets per list | 5 |
| Employer candidate lists | 5 |
| Bulk applicant action ids | 100 |
| Document upload size | 8 MB |
| Browse query result cap | 200 |
| Notifications returned | 500 |
| Idea comment length | 2000 characters |
| Reset token TTL | 1 hour |
| OTP / captcha TTL | 10 minutes |
| Session without "remember me" | 12 hours |
| Offer reminder cooldown | 24 hours |

---

## 10. Demo data and coverage

Demo depth target is **11 rows per tab, queue and filter combination**, verified by
`npm run audit:core-coverage`. Company names come from a catalog of 273 distinct real-sounding
names (`scripts/lib/ipCompanyCatalog.js`); every employer account has a unique company name so
two postings can never read as the same internship listed twice. QA fixtures draw from a
separate, disjoint 24-name pool so a test run can never take a demo company's name.

Two published postings deliberately have no `requirements_text` - they demonstrate the
blank-requirements rendering and must not be "fixed".

Text quality is gated by `npm run audit:demo-text` (rejects random-id jumble like `lhljn7g6`,
placeholder wording, and workflow statuses baked into names such as "Quill Content (Pending)")
and `npm run test:demo-text` guards the classifier against becoming greedy - legitimate titles
like "QA Automation Intern" must pass.

---

## 11. Reset semantics (read before running a reset)

`node scripts/IP_Reset_Core_Sample.js` does the following:

1. Deletes every user except the three core logins.
2. Refreshes the three core logins in place (name, password, active, role) - **they are never
   deleted**.
3. Clears transactional data owned by the cores (applications, offers, threads, messages,
   notifications, ratings, endorsements, login events, sessions).
4. Deletes all feature ideas and employer requests.
5. Re-seeds the baseline catalog, then runs `fill-core-coverage.mjs` to top every list to 11.

What **survives** a reset: the three logins, the `ip_candidates` / `ip_employers` profile
rows, and `ip_candidate_academics`. Existing profiles are only updated for `name` and
`skills`, so education and experience values persist.

What a reset does **not** restore: the bulk volume from `generate:ip-test-data` (today's
several thousand applications and ~460 postings). Reset gives the 11-row minimum per list -
enough for pagination and for every tab and filter to show something, but not the full demo
volume. This is by design; run `generate:ip-test-data` separately if you want the volume back.

Migrations are not run by reset. On a brand-new database, run the migrations (including 035)
before or after seeding.

---

## 12. Known defects and limits

### Fixed on 2026-08-31

These were found while writing this guide and have since been fixed. Listed so anyone reading
an older copy of the guide, or an older transcript, knows the current state.

| Was | Fix |
|---|---|
| Password reset from the emailed link always returned 400 - the page posted `password`, the confirm API read `newPassword` | `/forgot-password` now posts `newPassword` |
| Withdraw was restricted in the UI only, so a direct API call could withdraw a hired or rejected application | `PATCH /api/ip/candidate/applications/{id}` now re-checks status server-side and returns 409 outside `applied`/`pending` |
| A 2FA-enabled SuperAdmin could not sign in at `/superadmin/login` - no OTP step, so the raw `TWO_FACTOR_REQUIRED:<id>` string surfaced as an error | That page now has the same OTP step as `/` (Verify & continue / Resend code / Back to password), and still refuses non-superadmins after OTP |
| Employer "Pending Reviews" counted `under_review` and `pending`, which the DB CHECK constraint does not allow | Now counts `applied` + `shortlisted` |
| SuperAdmin "Auto-Approved / Google" card read `meta.autoApprovedGoogle`, which the API never sends, so it always showed 0 | Reads `meta.googleOauthVerified`, the key the API actually returns |
| A fresh seed gave all three demo candidates identical hardcoded education (`VIT / B.Tech / CSE / 2027 / 8.4`), which migration 035 could not repair because it only fills blanks | Education now comes from `education` blocks on `CAST_CANDIDATES` in `ipCoreSampleConfig.js`, matching 035. Filler `+coreNN` accounts spread across the college/city pools by index |
| A reset left the profile education section empty until migration 035 was run by hand | `seedCoreBaseline` now seeds `ip_candidate_academics` (current qualification + the one before it), skipping any candidate who already has rows |
| `seedCoreData` in `IP_Reset_Core_Sample.js` was ~380 lines of dead code - never called, and a stale duplicate of the real seeding path with its own hardcoded values | Deleted, with a note pointing at `ipSeedCoreBaseline.js` |

### Still open

**12.1 The document-type lists disagree between the two sides of the same queue.** An employer
can upload `Shop Act`, `LLP registration`, `Business PAN`, `Other`
(`src/app/employer/profile/page.js`), but SuperAdmin's type filter offers `Shop Act`,
`Business PAN`, `GST`, `Other` (`src/app/superadmin/documents/page.js`). So an LLP
registration can only be found under "All Document Types", and `GST` filters for a type no
employer can submit. The stored value is free text, so nothing breaks - the filter just
can't isolate one real category.

**12.2 Smaller gaps.** The "Recommended for You" browse tab shows no count even though the
API returns one. `/api/ip/nav-badges` returns an empty object for superadmins and never emits
the unread-message count it computes. The employer candidate-search skill pills (All, React,
Node.js, Figma, Python) are hardcoded, not derived from data. SMS and WhatsApp notification
preferences are stored but never delivered - no carrier is connected.

**12.3 No structured work experience in the current database.**
`candidates_with_structured_experience` is 0, so the employer-side experience rendering
(section 4.6) is correct but not currently exercised by live data. A fresh seed does populate
it, via `content.experienceEntriesJsonAt(i)` on the insert path.

### Not implemented at all

No payment or billing integration. No college-admin or placement-officer role. No SMS
delivery. No offers page for SuperAdmin. Google cannot be used to sign in - only to verify a
registration.
