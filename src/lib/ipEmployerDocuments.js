import { query } from '@/lib/db';

export const EMPLOYER_DOC_TYPES = ['Shop Act', 'LLP registration', 'Business PAN', 'Other'];

let ready = false;

/** Keep one active row per (employer, type); prefer approved, then newest. */
async function dedupeActiveEmployerDocuments() {
  await query(`
    WITH ranked AS (
      SELECT id,
             row_number() OVER (
               PARTITION BY employer_id, lower(doc_type)
               ORDER BY
                 CASE lower(coalesce(review_status, 'pending'))
                   WHEN 'approved' THEN 0
                   WHEN 'pending' THEN 1
                   ELSE 2
                 END,
                 created_at DESC NULLS LAST,
                 id DESC
             ) AS rn
      FROM ip_employer_documents
      WHERE superseded_at IS NULL
    )
    UPDATE ip_employer_documents d
    SET superseded_at = now()
    FROM ranked r
    WHERE d.id = r.id AND r.rn > 1
  `);
}

/** One active document per type: doc_label (Other subtype) + superseded_at for history. */
export async function ensureIpEmployerDocumentSlotsSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS file_size BIGINT`);
  await query(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS doc_label TEXT`);
  await query(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ`);
  await dedupeActiveEmployerDocuments();
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ip_employer_documents_active_type_uidx
    ON ip_employer_documents (employer_id, lower(doc_type))
    WHERE superseded_at IS NULL
  `);
  ready = true;
}

export function normalizeEmployerDocType(raw) {
  const s = String(raw || '').trim();
  const hit = EMPLOYER_DOC_TYPES.find((t) => t.toLowerCase() === s.toLowerCase());
  return hit || null;
}

/**
 * Insert a new active document for a type, superseding any prior active row of that type.
 * New uploads always start as pending (even when replacing an approved file).
 */
export async function replaceEmployerDocument({
  employerId,
  docType,
  docLabel = null,
  fileName = null,
  url = null,
  fileSize = null,
  id,
}) {
  await ensureIpEmployerDocumentSlotsSchema();
  const type = normalizeEmployerDocType(docType);
  if (!type) {
    return { ok: false, error: `docType must be one of: ${EMPLOYER_DOC_TYPES.join(', ')}` };
  }
  let label = docLabel != null ? String(docLabel).trim() : null;
  if (type === 'Other') {
    if (!label) {
      return { ok: false, error: 'Document name is required when type is Other' };
    }
  } else {
    label = null;
  }

  await query(
    `UPDATE ip_employer_documents
     SET superseded_at = now()
     WHERE employer_id = $1
       AND lower(doc_type) = lower($2)
       AND superseded_at IS NULL`,
    [employerId, type],
  );

  await query(
    `INSERT INTO ip_employer_documents
       (id, employer_id, doc_type, doc_label, file_name, url, file_size, review_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [id, employerId, type, label, fileName, url, fileSize],
  );

  return { ok: true, id, docType: type, docLabel: label };
}

export function employerDocDisplayTitle(row) {
  const type = String(row?.doc_type || 'Document');
  const label = String(row?.doc_label || '').trim();
  if (type === 'Other' && label) return `Other — ${label}`;
  return type;
}
