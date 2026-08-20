import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

const MAX_LISTS = 5;

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT l.*, (SELECT count(*)::int FROM ip_employer_list_members m WHERE m.list_id = l.id) AS member_count
     FROM ip_employer_lists l WHERE l.employer_id = $1 ORDER BY l.name ASC`,
    [emp.rows[0].id],
  );
  return jsonOk({ items: result.rows, max: MAX_LISTS });
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
  if (!name) return jsonError('List name is required');

  const count = await query(
    `SELECT count(*)::int AS n FROM ip_employer_lists WHERE employer_id = $1`,
    [emp.rows[0].id],
  );
  if (Number(count.rows[0]?.n || 0) >= MAX_LISTS) {
    return jsonError(`You can create at most ${MAX_LISTS} lists`, 400);
  }

  const id = newId('ip_list');
  try {
    await query(
      `INSERT INTO ip_employer_lists (id, employer_id, name) VALUES ($1,$2,$3)`,
      [id, emp.rows[0].id, name],
    );
  } catch (e) {
    if (String(e.message || '').includes('unique')) {
      return jsonError('A list with that name already exists', 409);
    }
    throw e;
  }
  return jsonOk({ ok: true, id }, 201);
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return jsonError('id required');
  const owned = await query(
    `DELETE FROM ip_employer_lists WHERE id = $1 AND employer_id = $2 RETURNING id`,
    [id, emp.rows[0]?.id],
  );
  if (!owned.rows[0]) return jsonError('Not found', 404);
  return jsonOk({ ok: true });
}
