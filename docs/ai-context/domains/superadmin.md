# Domain: SuperAdmin

## Responsibility

Platform oversight: employer approvals (incl. Reject/Suspend), candidates (read-only browse), documents, Adjust Points, postings, posting share rewards, login report, feature ideas, messages, bootstrap.

## Central sources

| Path | Role |
|------|------|
| `src/app/superadmin/**` | Pages |
| `src/app/api/ip/superadmin/**` | SuperAdmin APIs (incl. `points`, `employers`, `documents`) |
| `src/app/api/ip/bootstrap/` | Demo/bootstrap ensure |
| `src/lib/ensureIpBootstrap.js` | Bootstrap helper |
| Login | Home `/` (same form as other roles); `/superadmin/login` redirects to `/` |

## Pages (confirmed)

| Route | Purpose |
|-------|---------|
| `/superadmin` | Dashboard |
| `/superadmin/login` | Redirect-only → `/` (no SA form) |
| `/superadmin/approvals` | **Only** employer approval queue (Domain + Free-email). Path column on rows. **Reject** and **Suspend** available for approved employers (not only pending). |
| `/superadmin/candidates` | **Candidates** (2026-10-03, read-only) — every candidate account; tiles, profile tabs, search, "Applied to company" combobox + company strip (posting / status-at-company), filter panel, chips, selection, CSV export. Filters live in the query string |
| `/superadmin/candidates/[id]` | Candidate detail (`id` = `ip_users.id`): Overview / Applications (per-application timeline) / Companies / Offers / Activity. View CV, Copy email, Adjust points (`/superadmin/points?q=<email>`), Excel export. Back keeps list filters via `?list=` |
| `/superadmin/documents` | Documents (active rows only: `superseded_at IS NULL`) |
| `/superadmin/postings` | Postings oversight |
| `/superadmin/promotions` | Posting Share Rewards (LinkedIn posting-share claims) |
| `/superadmin/points` | **Adjust Points** — manual add/deduct on candidate or employer `ip_users.points`; floor 0; no cap; optional note; in-app notify user only (not advertised on user UIs) |
| `/superadmin/login-report` | Login report (default **All time**; not wiped by core reset) |
| `/superadmin/listing-reports` | Candidate listing reports (status open / reviewed / dismissed) |
| `/superadmin/messages` | Messages |
| `/superadmin/feature-ideas` | Feature ideas |

Retired (redirect → `/superadmin`): `/superadmin/viral` (orphaned viral-shares queue; APIs/table may remain).  
Retired (redirect → `/superadmin/approvals`): `/superadmin/form-registrations`, `/superadmin/requests`.  
APIs for those queues return **410**. Schema dropped on bootstrap: `ip_employer_requests`, `ip_users.form_approval_status` (`ensureIpRetireDeadQueuesSchema`).

Live employer onboarding = Domain / Free-email → Approvals only. Candidate register = Google path only (`path=form` → 410).

Employer email verify resend: `POST /api/ip/auth/employer-email-verify/resend` (login + post-register UI). Candidates do **not** use this verify gate.

**Suspend vs Reject:** both block login; keep as distinct `approval_status` values (`suspended` \| `rejected`). Do not collapse them.

Nav order: `src/lib/ipNav.js` → `SUPERADMIN_NAV`.

## Candidates (confirmed 2026-10-03)

| Path | Role |
|------|------|
| `GET /api/ip/superadmin/candidates` | `{ candidates, companies, truncated, cap }` — newest 5000 candidates (`SA_CANDIDATE_LIST_CAP`) with compact application / offer / no-application contact summaries; page filters, sorts, pages client-side |
| `GET /api/ip/superadmin/candidates/[id]` | Detail: profile + academics, applications with events, offers, contacts, referrer / referrals, sign-up method |
| `GET /api/ip/superadmin/candidates/[id]/export` | Excel — same sheets as the candidate self-export (`buildCandidateExportSheets`) |
| Libs | `src/lib/ipSuperadminCandidates.js` (server), `src/lib/ipSuperadminCandidatesView.js` (labels, filters, URL state, CSV) |
| CSS | `src/components/ip/ip-superadmin-candidates.css` (`.ip-sac` scope, `sac-*` classes in `@layer components`) |

- "Never returned after sign-up" = `last_login_at` empty or within 1 hour of `created_at` (registration signs the user in).
- Timeline: `ip_application_events` (minus `export`) + synthesized steps — `applied` when no event, offer sent / accepted / declined from `ip_offers`, current status when not logged. Withdraw has no event of its own; it comes from the `reapplied` payload `priorStatus` and shows as "Before <date>".
- "Contacted" = `ip_message_threads` with `application_id IS NULL`. "Name hidden on posting" = `ip_internships.show_employer_identity = false`.
- Read-only: no deactivate / edit actions. Over 5000 candidates the page shows a warning; move to server-side paging if the base grows past that.

## Email unsubscribe queue (confirmed 2026-10-03)

| Path | Role |
|------|------|
| `/superadmin/unsubscribes` | **Email unsubscribes** page (nav item): Pending / Processed tabs, Mark processed per row, Mark this page processed, IST dates |
| `GET` `/api/ip/superadmin/unsubscribe-requests?status=` | List requests (includes `processed_at`) |
| `PATCH` `/api/ip/superadmin/unsubscribe-requests` | `{ ids \| id }` (max 500) → PENDING → PROCESSED, sets `processed_at`, `processed_by`; returns `{ ok, processed }` |
| Public `/unsubscribe?token=…` + `/api/ip/unsubscribe` | User click creates **PENDING** row — mail continues until processed |
| Libs | `src/lib/ipEmailUnsubscribe.js` (`markUnsubscribeRequestsProcessed`, `isEmailUnsubscribed`), `ipEmailUnsubscribeFormat.js` |

Once PROCESSED, `sendMail` skips non-transactional single-recipient mail to that address (see `domains/auth.md`).

## Review actions and audit (confirmed 2026-10-03, Medium audit)

- Bulk selection on Approvals, Postings, Documents, Promotions and Feature ideas: select-all covers the **current page only**; selection clears when filter or search changes. Partial bulk failures stay visible after reload.
- Bulk Reject asks for confirmation. Rejected employers get **Set to Pending** (confirm → pending). Approve or Pending re-activates a deactivated login (`ip_users.active=true`).
- Dashboard review modal: reject reason from `REJECT_PRESETS` (`src/lib/ipDomainRisk.js`) + note, sent as `rejectionReason`; errors show inside the modal; modal state resets per employer.
- Reviewer columns (runtime, `ensureIpEmployerApprovalSchema`): `ip_employers.approval_reviewed_by`, `ip_internships.moderated_by` + `moderated_at`, `ip_employer_documents.reviewed_by`.
- Postings **Publish** requires the employer posting gate (`getEmployerPostingGate`); blocked rows come back in `failures`, 400 if none succeeded.
- Promotions: employer can re-submit a claim only while `pending`, `fast_track_pending` or `failed` (else 409).
- `POST /api/ip/ops/report-error` (public): 20 reports per IP per 10 min (429 after); `ipOpsAlert` sends at most `IP_OPS_ALERT_MAX_PER_HOUR` (default 30) alert mails per hour per instance, fingerprint map capped at 500.

## Confirmed demo account (from `README.md`)

Bootstrap via `/api/ip/bootstrap` ensures: `support@placementhub.online`. Local/Vercel QA password lives in `scripts/lib/ipCoreSampleConfig.js` (`SUPERADMIN_QA_PASSWORD` — separate from the candidate/employer core password).  
Do not invent alternate admin roles. Do not reset password hashes for existing SuperAdmin in bootstrap.

## Constraints

- SuperAdmin shares the home login `/`; SuperAdmin layout `loginHref` is `/`.
- Restore (Suspended → approved) keeps the earlier Final Approval (no ≥1-approved re-check) but is blocked while any active document is pending review: "Cannot restore <Company>: N document(s) still waiting for review…" (`assertNoPendingDocumentsForRestore`, 2026-09-29). Approving **or rejecting** the doc unblocks it — a suspended employer cannot sign in to replace a bad doc, so approve-only would be a dead end. The API only allows Suspend from approved. Approvals page shows the error (and bulk Restore Selected partial failures) on the page and inside Audit & Docs, with an Open Documents link.
- Treat approval/document/points flows as sensitive; inspect API auth checks before changes.
- Migration `036_ip_single_superadmin.sql` encodes single-superadmin data repair — read before changing admin user model.
- Final Approval still needs ≥1 approved active doc and no pending active docs (`assertDocumentsReadyForFinalApproval`).

## Related domains

Auth, Employer (approvals), Database, UI/UX.

## Inspect before modifying

Superadmin page, matching API, and shared approval/document/points helpers.
