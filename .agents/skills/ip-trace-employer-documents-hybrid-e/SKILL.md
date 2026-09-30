---
name: ip-trace-employer-documents-hybrid-e
description: Trace or change InternSafar employer verification documents under the Hybrid E model — one active row per doc type, re-upload supersedes (superseded_at), Other needs doc_label, new uploads start pending, SuperAdmin review, and every reader that must filter active rows. Use when touching ip_employer_documents, document upload/review, superseded_at, doc_label, or document counts.
---

# Trace employer documents — Hybrid E (`superseded_at`, `doc_label`)

Read first (app root `internship-portal/`):

- `docs/ai-context/domains/employer.md` — "Documents — Hybrid E"
- `docs/ai-context/domains/superadmin.md` — Final Approval / Restore rules
- `docs/ai-context/domains/database.md` — ensure helpers, blank-fill policy
- `docs/ai-context/DECISIONS.md`
- Wider journey: skill `ip-trace-employer-onboarding`

## Invariants

- Doc types are a closed list: `EMPLOYER_DOC_TYPES` = `Shop Act`, `LLP registration`, `Business PAN`, `Other` (`src/lib/ipEmployerDocuments.js`). Matching is case-insensitive via `normalizeEmployerDocType`.
- **One active row per (employer, lower(doc_type))**, enforced by partial unique index `ip_employer_documents_active_type_uidx … WHERE superseded_at IS NULL`.
- Re-upload = set `superseded_at = now()` on the prior active row, then insert a new row with `review_status = 'pending'` — even when the old one was approved. History rows are kept, never deleted.
- `Other` requires a non-empty `doc_label`; for every other type `doc_label` is forced to NULL. Because the index is per type, there is **one active `Other`** at a time regardless of label.
- `review_status`: `pending` | `approved` | `flagged` (API accepts `rejected` and stores `flagged`; UIs show "rejected").
- **Every reader that counts, lists, or gates on documents must filter `superseded_at IS NULL`.**
- Schema is created at runtime by `ensureIpEmployerDocumentSlotsSchema` (adds `file_size`, `doc_label`, `superseded_at`; dedupes to one active per type preferring approved → pending → newest; creates the index). It is idempotent and data-preserving.

## Workflow (trace in this order)

1. **Employer UI** — `src/app/employer/profile/page.js` (Documents tab; shows active docs + labels).
2. **Upload API (S3)** — `src/app/api/ip/employer/documents/upload/route.js`: `validateUploadMeta` / `validateUploadBuffer` (`src/lib/ipFileUpload.js`) → `uploadIpBuffer` (`src/lib/s3.js`, prefix `internship-portal/employers/<userId>/documents`) → `replaceEmployerDocument`.
3. **URL-only API** — `src/app/api/ip/employer/documents/route.js` (`POST` → `replaceEmployerDocument`).
4. **Core lib** — `src/lib/ipEmployerDocuments.js`: `ensureIpEmployerDocumentSlotsSchema`, `normalizeEmployerDocType`, `replaceEmployerDocument`, `employerDocDisplayTitle`.
5. **SA review** — `src/app/superadmin/documents/page.js` → `src/app/api/ip/superadmin/documents/route.js` (`GET` lists active only + meta counts; `PATCH` → `setOne` updates review + notifies employer).
6. **Approval gates** — `src/app/api/ip/superadmin/employers/[id]/route.js`: `assertDocumentsReadyForFinalApproval`, `assertNoPendingDocumentsForRestore` (both active-only).
7. **Other readers (must stay active-only)** — `src/app/api/ip/employer/profile/route.js`, `src/app/api/ip/employer/dashboard/route.js`, `src/app/api/ip/employer/profile/export/route.js`, `src/app/api/ip/superadmin/employers/route.js`, `src/app/api/ip/superadmin/stats/route.js`, `src/app/api/ip/superadmin/export-audit/route.js`, `src/app/api/ip/candidate/internships/route.js`, `src/app/api/ip/candidate/internships/[id]/route.js`.
8. **Related schema helpers** — `src/lib/ensureIpDocumentAuditSchema.js`, `src/lib/ensureIpEmployerApprovalSchema.js`, `src/lib/ensureIpIntegrityConstraints.js`.
9. **File download authz** — `src/lib/ipFileAccess.js` via `/api/ip/files`.
10. **Ops script** — `scripts/dedupe-employer-documents.mjs` (one-off dedupe; read before running, respects migrate gates policy).

When adding a new reader: grep `ip_employer_documents` under `src/` and confirm each hit has the active filter or a deliberate reason (e.g. audit history export).

## State layers — keep them separate when reporting

| Layer | Meaning |
|-------|---------|
| Active row | `superseded_at IS NULL` — the only row gates/queues use |
| History row | `superseded_at` set — kept for audit; S3 object not deleted |
| Review state | `review_status` on the active row |
| Account approval | `ip_employers.approval_status` — **not** changed by a re-upload |
| Final Approval readiness | derived by `assertDocumentsReadyForFinalApproval` at click time |

## Edge cases to test

- **Replace approved doc:** new row pending, old row superseded; SA Documents queue shows only the new one; employer stays `approved` (current behaviour — see risk 3).
- **Replay / double upload:** same type uploaded twice quickly → exactly one active row afterwards (index), no orphan without an active row (see risk 1).
- **Mixed old/new rows:** pre-Hybrid E employer with several active rows of one type → first `ensure…` call dedupes (approved wins, then pending, then newest); counts drop accordingly.
- **Other label:** `Other` without label → 400; `Other — GST` then `Other — MSME` → GST superseded (one active Other).
- **Type casing:** `business pan` normalises to `Business PAN`; unknown type → 400.
- **Stale SA tab:** SA reviews a doc id that was superseded meanwhile (see risk 2).
- **Final Approval / Restore** after re-upload → blocked until the new pending doc is reviewed.
- **S3 not configured** → 503 with hint, nothing written to DB.
- **Timezone:** `superseded_at` / `reviewed_at` are `TIMESTAMPTZ` set by `now()`; ordering uses `created_at` — check list order across midnight IST vs UTC.
- **AWS schema gap:** a DB missing `superseded_at`/`doc_label` gets them via the ensure helper on first request; plan the ADD + dedupe explicitly instead (skill `ip-trace-aws-path-b-schema-gap`).

## Known risks seen while writing this skill (2026-09-30 — observed, not fixed)

1. `replaceEmployerDocument` runs the supersede `UPDATE` and the `INSERT` as two separate queries (no transaction). If the insert fails, the employer is left with **no active row** for that type. Two concurrent uploads can also hit the unique index on the second insert (500).
2. `setOne` in `api/ip/superadmin/documents` updates by id without `superseded_at IS NULL`, so a stale SA tab can approve/flag a history row and notify the employer about it.
3. Replacing an approved doc does not change `approval_status`; an approved employer keeps posting while the new doc is pending. Confirm with the owner whether that is intended before changing it.

## Out of scope

- Candidate uploads (CV, profile files).
- Changing the doc-type list or allowing multiple active `Other` docs without an owner decision.
- Deleting history rows or S3 objects.
- New document states beyond `pending` / `approved` / `flagged`.
