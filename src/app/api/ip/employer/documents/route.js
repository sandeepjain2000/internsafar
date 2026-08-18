import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';

/**
 * Document metadata + optional URL reference.
 * Prefer file upload via POST /api/ip/employer/documents/upload (S3) when available.
 */
export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const docType = String(body.docType || '').trim();
  if (!docType) return jsonError('docType is required');

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  const id = newId('ip_doc');
  await query(
    `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url) VALUES ($1,$2,$3,$4,$5)`,
    [id, emp.rows[0].id, docType, body.fileName || null, body.url || null],
  );
  return jsonOk({ ok: true, id }, 201);
}
