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
    `SELECT * FROM ip_rejection_templates
     WHERE is_system = true OR employer_id = $1
     ORDER BY is_system DESC, name ASC`,
    [emp.rows[0]?.id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const name = String(body.name || '').trim();
  const tplBody = String(body.body || '').trim();
  if (!name || !tplBody) return jsonError('Name and body are required');
  const id = newId('ip_rej');
  await query(
    `INSERT INTO ip_rejection_templates (id, employer_id, name, body, is_system, version)
     VALUES ($1,$2,$3,$4,false,1)`,
    [id, emp.rows[0].id, name, tplBody],
  );
  return jsonOk({ ok: true, id }, 201);
}

export async function PUT(request) {
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
  const id = String(body.id || '');
  const existing = await query(
    `SELECT * FROM ip_rejection_templates WHERE id = $1 AND employer_id = $2 AND is_system = false`,
    [id, emp.rows[0]?.id],
  );
  if (!existing.rows[0]) return jsonError('Not found', 404);
  const name = body.name != null ? String(body.name).trim() : existing.rows[0].name;
  const tplBody = body.body != null ? String(body.body).trim() : existing.rows[0].body;
  await query(
    `UPDATE ip_rejection_templates
     SET name = $2, body = $3, version = version + 1, updated_at = now()
     WHERE id = $1`,
    [id, name, tplBody],
  );
  return jsonOk({ ok: true });
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const owned = await query(
    `DELETE FROM ip_rejection_templates WHERE id = $1 AND employer_id = $2 AND is_system = false RETURNING id`,
    [id, emp.rows[0]?.id],
  );
  if (!owned.rows[0]) return jsonError('Not found or system template', 404);
  return jsonOk({ ok: true });
}
