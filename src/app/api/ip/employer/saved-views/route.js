import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const result = await query(
    `SELECT * FROM ip_saved_applicant_views WHERE employer_id = $1 ORDER BY name ASC`,
    [emp.rows[0]?.id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const name = String(body.name || '').trim();
  if (!name) return jsonError('Name required');
  const id = newId('ip_sav');
  await query(
    `INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [id, emp.rows[0].id, name, JSON.stringify(body.filters || {})],
  );
  return jsonOk({ ok: true, id }, 201);
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const id = new URL(request.url).searchParams.get('id');
  await query(
    `DELETE FROM ip_saved_applicant_views WHERE id = $1 AND employer_id = $2`,
    [id, emp.rows[0]?.id],
  );
  return jsonOk({ ok: true });
}
