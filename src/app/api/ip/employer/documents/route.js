import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { replaceEmployerDocument } from '@/lib/ipEmployerDocuments';

/**
 * Document metadata + optional URL reference.
 * Prefer file upload via POST /api/ip/employer/documents/upload (S3) when available.
 * One active document per type — re-submit replaces the prior slot (new review = pending).
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
  const replaced = await replaceEmployerDocument({
    employerId: emp.rows[0].id,
    docType,
    docLabel: body.docLabel || body.documentName || null,
    fileName: body.fileName || null,
    url: body.url || null,
    fileSize: null,
    id,
  });
  if (!replaced.ok) return jsonError(replaced.error, 400);
  return jsonOk({ ok: true, id, replaced: true, reviewStatus: 'pending' }, 201);
}
