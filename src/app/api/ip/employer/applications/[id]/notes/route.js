import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

async function assertOwnedApplication(sessionUserId, applicationId) {
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [sessionUserId]);
  const row = await query(
    `SELECT a.id FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE a.id = $1 AND i.employer_id = $2`,
    [applicationId, emp.rows[0]?.id],
  );
  return { employerId: emp.rows[0]?.id, ok: Boolean(row.rows[0]) };
}

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const { ok } = await assertOwnedApplication(session.user.id, id);
  if (!ok) return jsonError('Not found', 404);
  const result = await query(
    `SELECT * FROM ip_application_notes WHERE application_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const { ok, employerId } = await assertOwnedApplication(session.user.id, id);
  if (!ok) return jsonError('Not found', 404);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const text = String(body.body || '').trim();
  if (!text) return jsonError('Note body required');
  const noteId = newId('ip_note');
  await query(
    `INSERT INTO ip_application_notes (id, application_id, employer_id, author_user_id, body)
     VALUES ($1,$2,$3,$4,$5)`,
    [noteId, id, employerId, session.user.id, text],
  );
  return jsonOk({ ok: true, id: noteId }, 201);
}
