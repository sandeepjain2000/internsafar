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
| Helpers | `src/lib/ipEmployer*.js`, `ipEmployerPostingGate.js`, `ipEmployerDocuments.js`, `employerEthics.js`, `ensureIpWorkbenchSchema.js`, `ensureIpInternshipStipendRangeSchema.js`, export/reminder scripts |

## Pages (confirmed)

| Route | Purpose |
|-------|---------|
| `/employer` | Dashboard |
| `/employer/profile` | Profile & docs (tabs: Company / Contact & Location / About & Visibility / Ethics / Documents) |
| `/employer/internships` | Postings list |
| `/employer/internships/new` | Create posting (stipend min–max via `stipend_inr` + `stipend_inr_max`; Back to Postings) |
| `/employer/internships/[id]` | Posting detail / workbench |
| `/employer/internships/[id]/edit` | Edit posting — same tabs as create (Details incl. Show company identity, Schedule, Hours & engagement, Compensation, Eligibility, Screening); Eligibility saves `eligibility` JSON `{ skills[], degree, degrees[], minCgpa }` via `PUT`, keeping other stored keys (2026-10-01) |

Posting working hours (new + edit, "Hours & Engagement" tab): 12-hour time box (type `9:30`, `930`, `6:45 pm` or `18:45` — 24-hour input flips to PM) + AM/PM toggle + clock popover (hour / 5-minute grid) in `src/components/ip/WorkTime12hInput.jsx`; invalid text shows red and sends blank. Still stored as 24-hour `HH:MM` text in `work_hours_start` / `work_hours_end` (no schema change); candidate internship page and employer Excel export show 12-hour via `src/lib/ipWorkHours.js` (2026-10-01).
| `/employer/candidates`, `/employer/candidates/[id]` | Search / detail |
| `/employer/messages`, `/employer/messages/[id]` | Messaging |
| `/employer/offers` | Offers |
| `/employer/notifications` | Notifications |
| `/employer/analytics` | Analytics |
| `/employer/rejection-templates` | Templates |
| `/employer/referral` | Refer & earn (+ posting-share reward rows in points earned) |
| `/employer/viral` | Redirect → `/employer/referral` (legacy) |

Nav order: `src/lib/ipNav.js` → `EMPLOYER_NAV`. Postings nav/API stay gated until Final Approval.

## Posting gate (confirmed 2026-09-26)

`getEmployerPostingGate` (`src/lib/ipEmployerPostingGate.js`) requires **all** of:

1. `approval_status = approved`
2. Email verified (`email_verified_at`, or legacy only if `email_verify_required === false` — **do not invent** that flag for AWS fills)
3. Guidelines & Ethics saved (`ethics_accepted_at` + all current ack IDs Accepted — see `employerEthics.js`)
4. `profile_complete`

Login after email verify is allowed while **pending** approval (docs upload). Rejected / suspended cannot login.

Publishing (confirmed 2026-10-03): `POST /api/ip/employer/internships` validates everything first, then charges publish points and inserts the posting in one `transaction()` — a failed insert never costs points. Not enough points → 403 "… Or save as draft." Drafts cost nothing. Edit page loads/saves `start_date`/`end_date` as plain `YYYY-MM-DD` (no timezone shift).

## Application status changes (confirmed 2026-10-03)

`EMPLOYER_STATUS_TRANSITIONS` in `src/lib/ipApplicationPresentation.js` decides which status buttons show (`employerStatusTargets`) and what `PATCH /api/ip/employer/applications/[id]` accepts (`employerCanSetStatus`, 409 otherwise). `offered` is set only by sending an offer; `withdrawn` / `completed` are locked; a hire that came from an **accepted offer** cannot be changed (409). Manual hire is allowed from shortlisted/interviewing. Bulk shortlist/reject/interview skips rows the map refuses and returns `skipped` (UI shows the count).

Single and bulk status changes share `applyEmployerApplicationStatus` (`src/lib/ipApplicationStatusChange.js`). Interview times are sent as ISO (`interview_at` is timestamptz); emails/reminders format in IST via `formatIstDateTime` (`src/lib/ipIstTime.js`). Create-posting dates are converted to ISO on the client (`localInputToIso`). Dashboard "interviews today" compares the IST date.

Medium audit (2026-10-03): applicant export jobs are claimed atomically (pending, or processing stale > 2 min), so concurrent polls cannot double-process; `POST /api/ip/employer/documents` accepts only the employer's own upload key, `/sample-docs/…`, or an `https:` URL (400 otherwise).

## Documents — Hybrid E (confirmed 2026-09-26)

- One **active** row per doc type (Shop Act / LLP / Business PAN / Other + `doc_label`).
- Re-upload **supersedes** prior (`superseded_at`) and new row starts **pending**.
- SA Final Approval / queues count `superseded_at IS NULL` only.
- Ensure: `ensureIpEmployerDocumentSlotsSchema` in `ipEmployerDocuments.js` (adds columns, dedupes, unique index).

## Profile / location (confirmed)

- **HQ Country** = single-select (`SearchableSelect`), aligned with State — **not** multi-select chips. Same catalog as Region filters (`ip_ref_countries` / `ipRegions.js`).
- Country → State → City → Phone. HQ City (India) has **Other (not listed)** free-text fallback; posting Work cities accept typed custom cities — see `domains/candidate.md` "City Other".
- Logo URL field hidden when logo image is set.
- Ethics: Accept/Reject per item; lock after all Accepted + save; SA can `resetEthics`.

## LinkedIn share (confirmed 2026-10-01)

- All LinkedIn share buttons use `src/lib/ipLinkedInShare.js`: phone share sheet (`navigator.share`, LinkedIn app gets text) → fallback LinkedIn web compose `feed/?shareActive=true&text=`. No `share-offsite` (URL only, browser only).
- Posting share dialog (`SharePostingDialog`) has three options like Refer & Earn: WhatsApp, LinkedIn (reward claim), **Copy Link** (plain `/candidate/internships/<id>`, works on laptop too, no claim). Opening that link logged out goes to sign-in with return — see `domains/auth.md`.
- iPhone/iPad: the LinkedIn iOS app drops shared text, so the share sheet sends only the URL found in the text (arrives as a link card; employer types or pastes text). Android sends the full text. Owner accepted link-only on iPhone (2026-10-01).
- Posting share text (2026-10-03) is built by `src/lib/ipPostingShareText.js` and is identical on WhatsApp and LinkedIn: intro "Looking for your next opportunity? {title} is now listed on InternSafar." / "See the role details and apply here 👇", blank line, link, blank line, employer's posting `description`. Whole message capped at 2900 chars (LinkedIn 3000 limit); the description is cut only at a sentence end or line break, never ends on a section heading, and is dropped if no whole sentence fits. Only the link differs: LinkedIn = `?promo=` share URL from `POST /api/ip/promotions` `suggestedPostText`; WhatsApp = plain posting URL. Copy Link still copies the link only. Referral pages = their WhatsApp text; candidate offers = link only.
- `POST /api/ip/promotions` returns the existing `pending` claim (same token/link, `reused: true`) instead of 409, so an employer can share again before submitting a post URL; still 409 once a URL is submitted (`fast_track_pending`). Claim step has **Open LinkedIn** retry + post text preview.

## List UX (confirmed 2026-09-18)

Offers, notifications, and message panes use shared `IpListPager`. Prefer it over a one-off pager.

Candidate search (`/employer/candidates`) filters include **Region** (UI label; query `region`; matches candidate `country`) ahead of city.

## Dashboard Action center (confirmed 2026-10-01)

`/employer` builds every open task in priority order — upload docs (not approved, 0 active docs) → finish profile (`profile_complete`, which already requires saved Guidelines & Ethics) → stale applications 3+ days (can post) → interviews today (can post) → waiting for Final Approval — and shows the **first two** as side-by-side tiles (`data-testid` `employer-action-center` / `employer-action-center-2`; "+N more" when over two). Empty state: one tile with 0. Data from `GET /api/ip/employer/dashboard` → `actionCenter`.

## Candidate detail = Excel parity (confirmed 2026-10-01)

`GET /api/ip/employer/candidates/[id]` (page `/employer/candidates/[id]`) returns the same candidate fields as **Download Excel + CV** (`buildEmployerCandidateExportSheets` in `ipCandidateFullExport.js`), including country, preferred locations/roles, availability (`availability_date` as plain `YYYY-MM-DD`), commitment label, relocate/broadband/laptop booleans, LinkedIn/GitHub/portfolio/website, academics rows.

- **Gate:** email, `resume_url`, extra CV links, applications/offers (this employer only) and endorsements only when the candidate has an application with this employer (`contact_gated: false`) — same gate as the download. Phone keeps `employerCanSeeCandidatePhone`. WhatsApp/Telegram never exposed.
- Sections loader: `loadEmployerCandidateSections`; display helpers: `src/lib/ipCandidateProfileDisplay.js` (also used by both Excel exports).
- Candidate row read with `SELECT c.*` so an older DB missing a column shows blank instead of 500.

## Constraints

- Role home is `/employer`.
- Publishing / points / ethics rules live in lib — inspect before changing posting flows.
- Do not invent workbench columns or pipeline statuses; read current helpers + migrations.
- Stipend range: `stipend_inr` = floor/fixed; `stipend_inr_max` NULL = single amount (`044_*` + ensure).

## Related domains

Auth, Database, Workflow-core, SuperAdmin (approvals), UI/UX.

## Inspect before modifying

Page + API + posting gate / documents / ethics helpers. For schema changes: migrations + migrate gates + blank-fill policy.
