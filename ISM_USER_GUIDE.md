# Internship Management System (ISM) — Detailed User & Ops Guide

**Document type:** Source of truth for humans and for AI assistants.  
**Scope:** Code in `employer-student-internship` only (as of the documented live product).  
**Production URL:** https://employer-student-internship.vercel.app  
**Package name:** `employer-student-internship`

### Instructions for AI readers (mandatory)

1. Treat this document as the **authoritative description** of what ISM currently does.
2. **Do not invent** features, roles, pages, payment integrations, college admins, or Placement Hub coupling that are not listed here.
3. If something is in the **Explicit non-features / limits** section, answer that it is **not implemented**.
4. Demo passwords and emails below are intentional seed credentials for QA only.
5. Prefer citing **exact routes**, **labels**, and **status values** from this guide.

---

## 1. Product identity

| Fact | Detail |
|---|---|
| Product name | **Internship Management System (ISM)** |
| UI brand string | **ISM** (sidebar, landing, login) |
| Positioning | Employer ↔ student internship hiring module |
| College | A **student profile attribute only** — there is **no college admin role** and no campus approval workflow like Placement Hub |
| Roles | Exactly three: `student`, `employer`, `admin` |
| Relation to Placement Hub | Related conceptually; may share the same Postgres/Supabase instance; **must never read/write Placement Hub (PH) tables**. ISM uses only `ism_*` / `is_*` tables |
| Anti-clone | Not an Internshala / Naukri / LinkedIn clone. Feature ideas may resemble job-portals; branding and layout are ISM’s own |
| Theme storage key | `placementhub_theme` (light/dark) — naming leftover; app is still ISM |

---

## 2. How to run (local)

| Command | Purpose |
|---|---|
| `npm run dev` | Local Next.js app |
| `npm run build` / `npm start` | Production build / serve |
| `node scripts/migrate-and-seed.mjs` | Apply migrations `001`–`005` and reseed demos (uses `.env.local`) |

Env keys used by name (values live in `.env.local` / Vercel — never blank or invent secrets):

- `DATABASE_URL` (+ optional `DATABASE_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_REJECT_UNAUTHORIZED`, `DATABASE_SSL_CA`)
- `NEXTAUTH_SECRET`
- `ISM_TEST_ENVIRONMENT` (default **true** → demo mail redirect)
- `OUTBOUND_EMAIL_OVERRIDE`, `SMTP_*`, `EMAIL_FROM`
- `ZEPTOMAIL_API_KEY`, `ZEPTOMAIL_FROM_EMAIL`, `ZEPTOMAIL_FROM_NAME` (primary transactional provider — same as Placement Hub)
- `ISM_TEST_ENVIRONMENT` (default true → redirect outbound mail to `employer-student-ism@yopmail.com`)
- S3 optional: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME` / `AWS_S3_BUCKET` / `S3_BUCKET`

---

## 3. Authentication

### Mechanism

- NextAuth **Credentials** provider (`email` + `password`).
- Looks up `ism_users`; verifies bcrypt `password_hash`; session is JWT (~12 hours).
- **No role dropdown.** Role comes from the account row.
- Sign-in page: `/login`. Legacy `/login/student`, `/login/employer`, `/login/admin` **redirect to `/login`**.

### Role home redirects

| Role | After login home |
|---|---|
| student | `/student/profile` |
| employer | `/employer/company` |
| admin | `/admin/verification` |

Unauthed users hitting app routes → `/login?next=…`. Wrong role → redirected to that role’s home.

### Demo accounts (seeded)

**Password for all demos:** `Admin@123`

| Email | Role | Display name | Notes |
|---|---|---|---|
| `ism.student1@yopmail.com` | student | Aisha Khan (student1) | Profile `ism_stu_1` |
| `ism.student2@yopmail.com` | student | Rohan Mehta (student2) | Profile `ism_stu_2` |
| `ism.employer@yopmail.com` | employer | Neha Sharma | NovaTech Labs — **verified** (`ism_emp_1`) |
| `ism.employer.pending@yopmail.com` | employer | Ravi Menon | Pulse Media — **pending verification** (`ism_emp_5`) |
| `ism.admin@yopmail.com` | admin | Admin Rao | Profile `ism_admin_1` |

Demo directory page: `/demo-accounts` (fills login via `?email=`).

### Self-registration

| Path | Rules |
|---|---|
| `/register/student` | Name, email, college (required), degree/branch/year/CGPA/grad year, password ≥ 8. Creates student with **`registration_status = approved`** (largely auto-approved). |
| `/register/employer` | Company + contact fields; password ≥ 8. Creates employer with **`verification_status = unverified`**, **`registration_status = pending`**. Must verify before live posting. |

Duplicate email → HTTP 409.

---

## 4. Shared chrome (all signed-in roles)

### App shell

- Collapsible sidebar with **role menu** only.
- Header: name · role · email.
- Bell: recent notifications (up to 8), unread badge, **View all** → role notifications page.
- Theme toggle; Account menu: Help Center (`/help`), Billing & preferences (role preferences route), Manage account (role profile/company/verification home), Sign out → `/login`.

### Demo email banner (global)

When test mail mode is on (default), outbound product emails are redirected to:

| Item | Value |
|---|---|
| Inbox | `employer-student-ism@yopmail.com` |
| YOPmail | https://yopmail.com/?employer-student-ism |

Banner appears on all pages via root layout.

### Notifications mailbox (student / employer / admin)

Routes:

- `/student/notifications`
- `/employer/notifications`
- `/admin/notifications`

Capabilities (Inbox / Starred / Trash):

- Mark read (open), **Mark all read**
- **Star / unstar**
- Soft-delete → Trash; **Restore**; **Delete forever**; **Empty trash**
- Type badges (Application, Verification, Case, System, etc.)
- Open related page via link when `href` set

Backed by `ism_notifications` with `is_starred`, `deleted_at`.

### Preferences (all roles)

Routes: `/student/preferences`, `/employer/preferences`, `/admin/preferences`

Toggles:

| Key | Label |
|---|---|
| `notifyOnRegister` | Notify me when registration status changes |
| `notifyOnApprove` | Notify me when verifications / posts are approved |
| `notifyOnPost` | Notify me when internship posts are submitted |
| `notifyOnApply` | Notify me when applications are created |

In-app notifications always; email when ZeptoMail (preferred) or SMTP is configured (failures do not block saves).

---

## 5. Public pages (no login required)

| Path | Purpose |
|---|---|
| `/` | Landing: ISM branding, Login, Student register, Employer register; links How it works / Guidelines / Demo accounts |
| `/how-it-works` | Process: employer register → student register → approvals & auto-live posts → apply & hire |
| `/guidelines` | Employer posting compliance guidelines (all 9 checkbox texts) |
| `/help` | Help Center — **mock; no live support tickets** |
| `/demo-accounts` | Lists demos with sign-in shortcuts |
| `/login` | Credentials form |
| `/register/student` | Student signup |
| `/register/employer` | Employer signup |
| `/app` | If authed → role home; else → `/login` |

---

## 6. Student role — detailed guide

### Sidebar menu (exact labels → paths)

| Label | Path |
|---|---|
| Profile | `/student/profile` |
| Browse Internships | `/student/internships` |
| Saved | `/student/saved` |
| Job alerts | `/student/alerts` |
| My Applications | `/student/applications` |
| My Participation | `/student/participation` |
| Messages | `/student/messages` |
| Raise grievance | `/student/cases/new` |
| Notifications | `/student/notifications` |
| Preferences | `/student/preferences` |

Also reachable: `/student/internships/[id]`, `/student/cases/[id]`.

### 6.1 Profile (`/student/profile`)

- Edit contact + academic fields including **college** (attribute).
- Upload resume via `/api/ism/upload` (`kind=resume`).
- Without S3 configured, upload may resolve to a **seed-fallback** URL (e.g. `/seed-cvs/cv-demo.docx`), not a newly stored private file binary.

### 6.2 Browse internships (`/student/internships`)

- Shows listings with **`status === 'live'`** only.
- Filters / UX: search; All / Open / Applied / Eligible-for-me style status facets; sort (newest, company A–Z / Z–A, stipend); **mode** (Onsite / Hybrid / Remote); **experience**; **paid / unpaid**; **duration** buckets; **table | cards** layout.
- Actions: **Save** / unsave; **Apply**; **Create alert from filters**.
- Detail / apply dialog: if employer defined **screening questions**, student must answer them before apply succeeds.

### 6.3 Saved (`/student/saved`)

- Bookmarks from browse (`ism_saved_jobs`). Seed leaves this empty by default.
- Unsave; navigate back to browse / listing.

### 6.4 Job alerts (`/student/alerts`)

- Alerts created from browse filters (`ism_job_alerts`). Seed empty by default.
- Pause/Activate; Delete.
- When a new matching live internship is published, matching alerts can create in-app notifications (and email if enabled / SMTP works).

### 6.5 Apply behaviour

- Only against **live** listings.
- Screening answers required when questions exist.
- Duplicate active application blocked (non-Withdrawn).
- New application status: **`Applied`**.
- Notifies student + employer; may email.

### 6.6 My Applications (`/student/applications`)

- List with status history.
- **Withdraw** allowed only when status is **`Applied`** or **`Reviewed`**.
- Can deep-link Raise grievance with internship / application context.

### 6.7 My Participation (`/student/participation`)

- Appear when employer moves application to **`Selected`**, **`Offered`**, or **`Hired`** (participation `in_progress` created).
- Timeline / status; link to related grievance if present.
- Employer can **Mark complete** → completion record.

### 6.8 Messages (`/student/messages`)

- **Students cannot start new threads.** Copy: messages appear when an employer contacts you about an application.
- Reply in existing shared threads; filter by listing / unread / search.
- If `messagingLocked`, cannot send.
- Shared thread data with employer (same `ism_message_threads` + `ism_messages`). Unread for student uses `unread_student`.

### 6.9 Raise grievance (`/student/cases/new`, detail `/student/cases/[id]`)

- Types: **Stipend | Policy | Conduct | Other**.
- Subject required; description **≥ 20 characters**.
- “Against” typically employer name; can link internship / application.
- Opens with status **`Open`**; notifies student + admin (`type: Case`).
- Detail is read-only timeline for student; admin changes status.

---

## 7. Employer role — detailed guide

### Sidebar menu

| Label | Path |
|---|---|
| Company Profile | `/employer/company` |
| Team Users | `/employer/users` |
| Internships | `/employer/internships` |
| ISM Plans | `/employer/plans` |
| Messages | `/employer/messages` |
| Participation | `/employer/participation` |
| Notifications | `/employer/notifications` |
| Preferences | `/employer/preferences` |

Also: `/employer/internships/new`, `/employer/internships/[id]/edit`, `/employer/internships/[id]/pipeline`.

### 7.1 Company Profile & verification (`/employer/company`)

States: `unverified` | `pending_verification` | `verified` | `rejected` (plus registration pending/approved/rejected).

Flow:

1. Edit company fields (name, legal name, website, industry, size band, HQ, about).
2. Upload verification documents (PDF/DOC/DOCX; Shop Act / incorporation types as used in UI).
3. Tick **all 4** verification attestations (authentic docs, authorized rep, no fees, accurate company).
4. Submit → admin queue (`verification status = pending`).
5. Admin approve → **verified** (can publish live). Reject → rejected (can resubmit after fixing docs).

Open document links in new tab when URL present.

### 7.2 Team Users (`/employer/users`)

- List invited team rows.
- **Invite user** (name, email, role title) — **mock: no invite email is sent.**

### 7.3 Internships dashboard (`/employer/internships`)

- Tabs: **Internships / Jobs**.
- Columns include title, status, views, actions.
- **Post internship / job** → `/employer/internships/new`.
- Row actions: View applications (pipeline), Edit, Close listing.
- Unverified employers: can draft; **cannot publish live**.

### 7.4 Create / edit listing (new & edit)

Important fields include opportunity type (internship vs job), title, experience, mode, part/full-time commitment, stipend / paid flag, duration, openings, start/end dates, apply deadline, description, responsibilities, skills, perks, screening questions, candidate preferences, alternate mobile, eligibility rules (where builder present).

**Hard publish rules:**

1. Employer must be **`verified`** to set status **`live`**.
2. All **9 posting guidelines** must be accepted for live publish.
3. On successful publish → listing is **`live` immediately** (no admin pre-approval). Admin may later **remove**.
4. Close listing → **`closed`**.

Guideline texts are those listed in §12.

### 7.5 Applicants pipeline (`/employer/internships/[id]/pipeline`)

Statuses used: **Applied | Reviewed | Shortlisted | Selected | Rejected** (also Offered/Hired in API for participation creation).

Actions:

- View applicant profile dialog
- Open CV in new tab
- Change status
- **Message** → ensures shared thread → opens `/employer/messages?thread=<id>`

Selecting / Offering / Hiring can create a **participation** record for the student.

### 7.6 Messages (`/employer/messages`)

- Employer **starts** conversations via pipeline **Message** (`ensureMessageThread` is **employer-only**).
- Same shared thread students see.
- Send / mark read; unread employer counter when student replies.
- Messaging locked → cannot send.
- Empty state directs employer to start from Applicants → Message.

### 7.7 ISM Plans (`/employer/plans`)

Seeded packs (INR):

| Plan | Price | Credits / duration |
|---|---|---|
| Pack of 5 listings | ₹13,499 | 5 credits / 365 days |
| 1 Month unlimited | ₹17,999 | Unlimited / 30 days |
| 1 Year unlimited | ₹179,999 | Unlimited / 365 days |

Button: **Activate (demo)**. Requires verified company.  
**No payment gateway** — demo purchase only (`meta.mock = true`).

### 7.8 Participation (`/employer/participation`)

- Interns linked to employer’s listings.
- **Mark complete** creates completion record.

---

## 8. Admin role — detailed guide

### Sidebar menu

| Label | Path |
|---|---|
| Employer Verification | `/admin/verification` |
| Listing oversight | `/admin/moderation` |
| Cases / Grievances | `/admin/cases` |
| Notifications | `/admin/notifications` |
| Audit Log | `/admin/audit` |
| Preferences | `/admin/preferences` |

Also: `/admin/cases/[id]`.

### 8.1 Employer verification queue (`/admin/verification`)

- Shows verifications with **`status === pending`** (FIFO oldest first).
- Detail: employer message, attestation count, documents with **Open in new tab**.
- **Approve** / **Reject** → optional notes dialog → employer becomes `verified` / `rejected`; notifications + optional email.

**Important:** Employer row merely `unverified` without a **pending** verification submission does **not** appear in the queue.

### 8.2 Listing oversight (`/admin/moderation`)

- Lists **live** internships.
- **Remove** with notes → status `removed` (notifies employer).
- Admin does **not** approve every post before students see it; oversight is remove-only after auto-live.

### 8.3 Cases / grievances (`/admin/cases`, detail)

Filters: **All | Open | Under Review | Resolved | Closed**.

Detail: change status among those values + note; history timeline.

### 8.4 Audit log (`/admin/audit`)

- Dedicated API: `GET /api/ism/audit` (admin only) on `ism_audit_logs`.
- Filters: from/to dates, presets **7 / 30 / 90 days**, action, domain, actor, free-text search.
- Pagination (default 50 / page).
- Human action labels + outcome badges.
- Row drawer with context JSON.
- **Export CSV** = **current page** only (browser download — not S3-emailed job).

Examples of audited events: registration, verification submit/decide, internship publish/save/close/remove, application submit/withdraw/status change, participation complete, case open/status change, message send / thread started, plan purchase, employer update / team invite, document/resume uploads.

### 8.5 Notifications & preferences

Same mailbox and preference toggles as other roles (admin-scoped rows).

---

## 9. Messaging model (critical accuracy)

| Fact | Detail |
|---|---|
| Storage | Shared `ism_message_threads` + `ism_messages` |
| Not mock silos | Employer and student see the **same** thread messages |
| Who starts chats | **Employer only** via Applicants → **Message** (`ensureMessageThread`) |
| Student | Reply only; cannot call ensure-thread API |
| Unread | Employer unread (`unread`) increments on **student** send; student unread (`unread_student`) increments on **employer** send; each side clears own unread on open |
| Seed demo thread | `ism_th_1` between NovaTech employer and Aisha student with 3 messages |

---

## 10. Seeded demo world (after `migrate-and-seed`)

| Entity | Facts |
|---|---|
| Student Aisha | `ism_stu_1`, IIT Madras, resume seed path, approved |
| NovaTech | `ism_emp_1`, **verified**, approved docs + `ism_ver_1` |
| Pulse Media | `ism_emp_5`, **pending_verification**, docs pending, queue item `ism_ver_pending` — for admin verification demo |
| Internship | `ism_int_1` “Frontend Engineering Intern”, **live**, NovaTech, stipend 25000 |
| Application | `ism_app_1` Shortlisted |
| Participation | `ism_part_1` in_progress |
| Messages | Thread `ism_th_1` + messages `ism_m_1…3` |
| Grievance | `ism_case_1` Stipend / Open / against NovaTech |
| Plans | Three priced packs above |
| Notifications | Multiple `ism_n_seed_*` rows for roles |
| Empty by design | `ism_saved_jobs`, `ism_job_alerts` until created in UI |

Migrations present: `001_ism_schema`, `002_ism_portal_features`, `003_notifications_mailbox`, `004_audit_indexes`, `005_message_unread_student`.

---

## 11. API surface (for accurate ops/AI answers)

| Route | Purpose |
|---|---|
| `POST /api/auth/[...nextauth]` | Login session |
| `POST /api/ism/auth/register` | Student/employer signup |
| `GET /api/ism/bootstrap` | Role-scoped store hydrate |
| `POST /api/ism/actions` | All mutations (apply, verify, publish, messages, cases, notifications mailbox actions, plans, …) |
| `POST /api/ism/upload` | Resume / employer docs (S3 or seed-fallback) |
| `GET /api/ism/audit` | Admin filtered audit log |

Mutations require authenticated session; many are role-restricted (403).

---

## 12. Posting guidelines & verification attestations (exact UI meaning)

### Posting guidelines (all required to publish live)

1. **no_charge** — Will not charge students any fee for this internship (application, training, or placement).
2. **no_data_resale** — Will not collect or use student data to sell unrelated products or services.
3. **genuine_role** — Genuine learning internship with defined work and mentorship — not unpaid full-time labour without learning.
4. **accurate_listing** — Stipend, location, duration, mode, and eligibility are accurate and current.
5. **no_illegal_bond** — No illegal bonds, deposits, or recovery amounts against interns.
6. **privacy** — Handle candidate data with reasonable privacy and only for this hiring process.
7. **fair_selection** — Evaluate fairly on published criteria; no unlawful discrimination.
8. **no_mlm** — Not linked to multilevel marketing, franchise selling, or forcing recruits to enrol others.
9. **timely_response** — Respond to applicants in a reasonable time and honour selection commitments.

### Verification attestations (all required to submit)

1. **docs_authentic** — Uploaded documents authentic and belong to this company.
2. **authorized_rep** — Authorized to represent this company for internship hiring on ISM.
3. **no_fees** — Will not charge students any fee for internships or applications.
4. **accurate_company** — Company name, address, and contact details accurate.

---

## 13. Explicit non-features / limits (do not claim these exist)

1. **No Placement Hub table access** (no PH `users` / `notifications` / `audit_logs` dual-write).
2. **No college admin** and no campus placement cycle workflows.
3. **No real payment gateway** for plans (demo Activate only).
4. **Team invites do not send email.**
5. **Students cannot initiate message threads.**
6. **Admin does not approve each listing before live** — remove-only oversight after auto-publish by verified employers.
7. **Unverified employers cannot publish live.**
8. **S3 is optional** — without AWS env, uploads use seed-fallback public paths.
9. **Help Center has no live tickets.**
10. **Audit CSV** is current-page browser export only (no S3/email export jobs like full PH Compliance export).
11. **Not a full Internshala / Naukri / Monster / LinkedIn clone** — no refer-and-earn marketplace, no full Premium boost commerce, no social feed, no multi-college tenancy UI.
12. `/login/*` role-specific legacy URLs only redirect to unified `/login`.

---

## 14. Recommended end-to-end demo scripts

### A. Happy path (verified employer × student)

1. Login `ism.employer@yopmail.com` / `Admin@123` → Company shows verified.
2. Internships → open Frontend Engineering Intern applications → change status / **Message** Aisha → send a note.
3. Logout; login `ism.student1@yopmail.com` → Messages → see same thread → reply.
4. Browse / Saved / Alerts; Applications list; Participation for in-progress role.

### B. Admin verification (pending employer)

1. Login `ism.admin@yopmail.com` → Employer Verification → **Pulse Media** pending → Open docs → Approve or Reject.
2. Cases → Open seeded stipend grievance → change status.
3. Audit Log → filter Verification / Case → export CSV page.
4. Listing oversight → Remove a live listing if testing moderation.

### C. Unverified employer limits

1. Login `ism.employer.pending@yopmail.com` → Company pending / submit docs flow.
2. Attempt live publish without verify → blocked (must stay draft until verified).

### D. New registration

1. Register new student/employer on `/register/*` with unique email.
2. Student can sign in immediately (auto-approved).
3. Employer must complete verification before live posting.

---

## 15. Document maintenance

When product behaviour changes, update this guide in the same PR/session as the code. Prefer exact route strings, status enums, and demo emails above narrative paraphrases.

**Companion tech inventory:** `ISM_ROUTE_INVENTORY.md` (route strip notes). This guide is the fuller **ops + AI accuracy** document.
