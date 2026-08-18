import { query } from '@/lib/db';

let ready = false;

/** file_size + allow rejected as review_status alias for flagged. */
export async function ensureIpDocumentAuditSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_employer_documents ADD COLUMN IF NOT EXISTS file_size BIGINT`);
  ready = true;
}

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!n || n < 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
