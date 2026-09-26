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
| `/employer/internships/[id]/edit` | Edit posting |
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

## Documents — Hybrid E (confirmed 2026-09-26)

- One **active** row per doc type (Shop Act / LLP / Business PAN / Other + `doc_label`).
- Re-upload **supersedes** prior (`superseded_at`) and new row starts **pending**.
- SA Final Approval / queues count `superseded_at IS NULL` only.
- Ensure: `ensureIpEmployerDocumentSlotsSchema` in `ipEmployerDocuments.js` (adds columns, dedupes, unique index).

## Profile / location (confirmed)

- **HQ Country** = single-select (`SearchableSelect`), aligned with State — **not** multi-select chips. Same catalog as Region filters (`ip_ref_countries` / `ipRegions.js`).
- Country → State → City → Phone.
- Logo URL field hidden when logo image is set.
- Ethics: Accept/Reject per item; lock after all Accepted + save; SA can `resetEthics`.

## List UX (confirmed 2026-09-18)

Offers, notifications, and message panes use shared `IpListPager`. Prefer it over a one-off pager.

Candidate search (`/employer/candidates`) filters include **Region** (UI label; query `region`; matches candidate `country`) ahead of city.

## Constraints

- Role home is `/employer`.
- Publishing / points / ethics rules live in lib — inspect before changing posting flows.
- Do not invent workbench columns or pipeline statuses; read current helpers + migrations.
- Stipend range: `stipend_inr` = floor/fixed; `stipend_inr_max` NULL = single amount (`044_*` + ensure).

## Related domains

Auth, Database, Workflow-core, SuperAdmin (approvals), UI/UX.

## Inspect before modifying

Page + API + posting gate / documents / ethics helpers. For schema changes: migrations + migrate gates + blank-fill policy.
