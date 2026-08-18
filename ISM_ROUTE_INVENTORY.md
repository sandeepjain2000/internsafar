# ISM route/button inventory (Priority 3)

Status: LIVE = keep+wire DB | DEAD = remove or replace | MERGE-SPLIT = restructure

**Execution note (2026-08-07):** Real-app cutover shipped — NextAuth → `ism_users`, `/api/ism/*` + bootstrap, IsmStore API-backed, production URL https://employer-student-internship.vercel.app

Decisions locked:
- Posting: auto-live after employer verify; admin REMOVE (Listing oversight)
- Plans: INCLUDE (ism_plans + employer buy/mock purchase flow)

## Public / auth

| Route | Now | Target |
|---|---|---|
| `/` landing | Unified login ON landing | **MERGE-SPLIT**: content + **Login** CTA → `/login` (PH pattern) |
| `/login` | missing | **LIVE** new single Credentials login (Student|Employer|Admin demos) |
| `/login/student\|employer\|admin` | redirect stubs | **DEAD** → redirect `/login` |
| `/demo-accounts` | mock | **LIVE** PH-style demo picker → `/login` |
| `/register/student` | mock store | **LIVE** API → `ism_students` auto-approve |
| `/register/employer` | mock store | **LIVE** API → `ism_employers` pending |
| `/how-it-works`, `/guidelines`, `/help` | static | **LIVE** content pages |
| `/app` | hub? | Inventory in code — keep or redirect `/` |

## Student

| Route / control | Now | Target |
|---|---|---|
| `/student/profile` | IsmStore | **LIVE** CRUD APIs |
| Resume upload/update | local mock URL | **LIVE** S3/`ism_students.resume_*` if AWS env else store meta |
| `/student/internships` browse+dialog | mock | **LIVE** |
| `/student/internships/[id]` | dialog deep-link | **LIVE** keep |
| Apply | mock | **LIVE** `ism_applications` |
| `/student/applications` | mock | **LIVE** + withdraw |
| Raise grievance | mock | **LIVE** `ism_cases` |
| `/student/cases/new`, `/student/cases/[id]` | mock | **LIVE** |
| `/student/participation` | mock | **LIVE** |
| `/student/notifications` | mock | **LIVE** `ism_notifications` |
| `/student/preferences` | local toggles | **LIVE** prefs in `ism_users` or `ism_notification_prefs` |

## Employer

| Route / control | Now | Target |
|---|---|---|
| `/employer/company` verify flow | mock | **LIVE** docs → `ism_employer_documents` + submit verification |
| `/employer/users` | mock invite | **LIVE** `ism_employer_users` or remove invite if incomplete |
| `/employer/internships` dashboard | mock | **LIVE** |
| `/employer/internships/new` + edit | mock FORM | **LIVE** FORM_PATTERN + compliance checkboxes |
| Pipeline | mock | **LIVE** status updates |
| `/employer/messages` | mock | **LIVE** `ism_messages` |
| `/employer/participation` | mock | **LIVE** |
| Plans | missing (skipped earlier) | **LIVE** NEW `/employer/plans` + `ism_plans` / `ism_employer_plan_purchases` |
| Notifications / preferences | mock | **LIVE** |

## Admin

| Route / control | Now | Target |
|---|---|---|
| `/admin/verification` | mock | **LIVE** approve/reject employer |
| `/admin/moderation` | remove listings | **LIVE** oversight REMOVE (not pre-approve) |
| `/admin/cases` list+detail | mock | **LIVE** |
| `/admin/notifications`, `/admin/audit` | mock | **LIVE** |
| Preferences | mock | **LIVE** or thin prefs |

## Expected REMOVE / DEAD

| Item | Action |
|---|---|
| Client `IsmStore` + wireframe `src/data/mock.js` as runtime SoT | Replaced with APIs + SQL seed; `mock.js` removed |
| Mock `AuthProvider` localStorage session | Replace NextAuth |
| Role-specific `/login/*` pages as product entry | Redirect → `/login` |
| Toast-only primary actions | Wire or delete |
| Sidebar “Placement Hub / college attribute” meta copy | Already removed |
| Boost / Upgrade Premium column | Keep out unless Plans UX needs indicator (Plans included — Premium badge OK if tied to purchase) |

## Expected SPLITS (only existing merges)

| Item | Action |
|---|---|
| Landing login-on-page | Split → landing content + `/login` |
| Student browse detail | Already dialog + optional `[id]` — keep, don’t invent more |
| Post new vs edit | Already split — polish FORM_PATTERN |

## Tables to create (ism_ / is_ only)

- `ism_users` (auth: email, password_hash, role, name)
- `ism_students`
- `ism_employers`
- `ism_employer_documents`
- `ism_employer_verifications`
- `ism_employer_users` (optional team)
- `ism_internships`
- `ism_internship_compliance`
- `ism_applications`
- `ism_participations` / `ism_completions`
- `ism_messages` (+ threads or thread_id)
- `ism_cases`
- `ism_notifications`
- `ism_audit_logs`
- `ism_notification_prefs`
- `ism_plans`
- `ism_employer_plan_purchases`

No PH table R/W/ALTER/DROP.
