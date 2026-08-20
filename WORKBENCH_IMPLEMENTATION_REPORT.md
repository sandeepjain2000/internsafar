# InternSafar Workbench — Implementation Report

Date: 2026-08-20  
Repo: sibling `internship-portal` only

## Migrations

| File | Purpose |
|---|---|
| `db/migrations/016_ip_workbench_lifecycle.sql` | `starts_at`, `apply_ends_at`, `closed_reason`, `locations`; application snapshot/disable/rejection template cols; `ip_generated_runs`; `ip_users.generated_run_id` |
| `db/migrations/017_ip_workbench_recruiter.sql` | Lists, list members, rejection templates (+ system default), saved views, notes, events, reminders, bulk message jobs, filter prefs |
| `db/migrations/018_ip_export_jobs_schedule_reminders.sql` | `ip_export_jobs`; posting `remind_before_*` / hours / `*_sent_at` |

Applied via `npm run db:migrate:workbench` (ensure helpers also apply idempotently at runtime).

## Core libraries

- `src/lib/ipInternshipVisibility.js`
- `src/lib/ipApplicationVolume.js`
- `src/lib/ipScreeningQuestions.js`
- `src/lib/ipApplicationCapacity.js`
- `src/lib/ipMessageResponseState.js`
- `src/lib/ipEmployerIdentity.js`
- `src/lib/ipCandidateInternshipHistory.js`
- `src/lib/ipApplicantExport.js` / `ipApplicantExportPolicy.js`
- `src/lib/ipScheduleReminders.js`
- `src/lib/ensureIpWorkbenchSchema.js`

## Feature status matrix

| Feature | Status | Key files / notes |
|---|---|---|
| Application volume ranges (candidate) + exact employer counts | NEWLY IMPLEMENTED / EXTENDED | Volume helpers; candidate list/detail APIs; employer list capacity |
| Posting schedule + visibility + lifecycle labels | NEWLY IMPLEMENTED / EXTENDED | `starts_at`/`apply_ends_at`; visibility SQL; create/edit UI; repost |
| Optional auto reminders before launch/close (§3.2) | NEWLY IMPLEMENTED | Create/edit toggles; `processScheduleReminders`; cron API + CLI |
| Candidate preview | NEWLY IMPLEMENTED | `InternshipCandidatePreview.jsx`; create/edit buttons |
| MCQ screening (max 5) + optional required + snapshot | NEWLY IMPLEMENTED | `ScreeningQuestionsEditor`; apply path snapshot |
| Generic trigger-answer application disabling | NEWLY IMPLEMENTED | `disableApplicationOnAnswers` / option flags; greyed rows + filter |
| Applicant workbench bulk + filters (incl. Unread / Unresponded) | NEWLY IMPLEMENTED / EXTENDED | applicants GET server-side; bulk route; pipeline UI |
| Resume ZIP + background export jobs (§3.10) | NEWLY IMPLEMENTED | CSV sync / ZIP+async jobs; poll `export-jobs/[id]`; cron drain |
| Candidate lists (max 5) | NEWLY IMPLEMENTED | `api/ip/employer/lists` |
| Personalized bulk messaging | NEWLY IMPLEMENTED | bulk `message` + retry; personalize helpers |
| Rejection templates | NEWLY IMPLEMENTED | system default + CRUD API + settings page |
| Candidate internship history (privacy) | NEWLY IMPLEMENTED | derived from `ip_applications` (no participations table) |
| Application cap 100 active | NEWLY IMPLEMENTED | advisory-lock transactional insert |
| Candidate email prefs | ALREADY RETAINED | existing notification prefs unchanged |
| City / work-location filter | EXTENDED | multi-city `locations` + `location`; API matcher |
| Employer identity masking | EXTENDED | apps, offers, messages (was browse/detail only) |
| Candidate application table + filters | EXTENDED | server filters; identity mask; interview/offer/comm |
| Intelligent default filters + persistence | EXTENDED | localStorage prefs; reset chips; server prefs table |
| Saved views / compare / notes / timeline / reminders | NEWLY IMPLEMENTED | APIs + workbench UI |
| Quality checklist / duplicate warning / closure summary | NEWLY IMPLEMENTED | create page checklist; create API duplicate warning; closure-summary API |
| Match vs validation scores | ALREADY RETAINED | kept distinct |
| Generate/delete-by-run-ID | NEWLY IMPLEMENTED | scripts + `PROTECTED_ACCOUNT_EMAILS` (3 accounts) |
| Broader Playwright/QA matrix (§5) | NEWLY IMPLEMENTED | `qa:workbench` / `qa:workbench:live` |

## Protected accounts (generate/delete)

From `scripts/lib/ipCoreSampleConfig.js` → `PROTECTED_ACCOUNT_EMAILS`:

- `lawsonlclintern+1@gmail.com`
- `shreekar.nyayapathi23+2@vit.edu`
- `placementhubsupport@gmail.com`

Scripts abort if config invalid. Delete requires `--confirm-generated-run RUN_ID` and verifies password_hash/role/email unchanged.

## Tests run

- `npm run test:workbench` — unit (visibility, volume, MCQ disable, unread≠responded, export thresholds, protected config)
- `npm run qa:workbench` — broader §5 matrix (unit cases)
- `npm run qa:workbench:live` — matrix + API/Playwright smoke (requires `npm run dev` + cast accounts)
- `npm run db:migrate:workbench` — includes migration `018`

## npm scripts

- `db:migrate:workbench` (016–018)
- `test:workbench`
- `qa:workbench` / `qa:workbench:live`
- `cron:schedule-reminders` / `cron:export-jobs`
- `generate:ip-test-data` / `delete:ip-generated-run`

## Cron / ops

| Endpoint / CLI | Purpose |
|---|---|
| `POST /api/ip/cron/schedule-reminders` | Due launch/close employer reminders (idempotent `*_sent_at`) |
| `POST /api/ip/cron/export-jobs` | Drain pending ZIP/CSV export jobs |
| `npm run cron:schedule-reminders` | CLI → cron API (`IP_BASE`, optional `IP_CRON_SECRET`) |
| `npm run cron:export-jobs` | CLI → export drain API |

When `IP_CRON_SECRET` is set, callers must send header `x-ip-cron-secret`. Otherwise employer/superadmin session auth is required.

## Gap closure (2026-08-20 follow-up)

| Gap | Status |
|---|---|
| City browse multi-select (searchable, independent of MCQ disable) | Done — browse UI + `availableCities` API |
| CSV applicant export | Done — bulk export returns CSV + audit event |
| MCQ response count/% summary | Done — `mcqSummary` on applicants API + panel |
| Internship history filters (total/completed/ongoing) | Done — applicant filters |
| Closing soon lifecycle | Done — within 48h of `apply_ends_at` |
| Rejection templates settings page | Done — `/employer/rejection-templates` + nav |

## Deferred closure (2026-08-20 — doc §3.10 / §3.2 / §5)

| Gap | Status |
|---|---|
| Resume ZIP + large background export jobs | Done — `ip_export_jobs`, sync/async bulk export, poll download, cron drain |
| Optional auto reminders before launch/close | Done — posting flags + cron processor + create/edit UI |
| Broader Playwright/QA matrix | Done — `run-ip-workbench-qa.mjs` unit + `--live` API/UI smoke |

## Remaining / limitations

- Job alerts product (`ip_job_alerts`) was not in the live IP codebase and was not built (notification prefs retained).
- ZIP resume fetch depends on reachable resume URLs / S3; missing files are counted as skipped.
- Full Excel checklist (`qa:checklist`) remains the larger product suite; workbench matrix covers P0 workbench rules.

## Definition of done note

UI + API + DB + unit/QA matrix for P0 acceptance items (including §3.10 export, §3.2 schedule reminders, §5 matrix) are wired together. Run `npm run db:migrate:workbench` on each environment before relying on new columns/tables in production.
