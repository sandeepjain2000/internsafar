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
    `SELECT * FROM ip_follow_up_reminders
     WHERE employer_id = $1 AND completed_at IS NULL
     ORDER BY remind_at ASC LIMIT 50`,
    [emp.rows[0]?.id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer missing', 404);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const remindAt = body.remindAt;
  if (!remindAt) return jsonError('remindAt required');
  const id = newId('ip_rem');
  await query(
    `INSERT INTO ip_follow_up_reminders (id, employer_id, application_id, internship_id, remind_at, note)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, emp.rows[0].id, body.applicationId || null, body.internshipId || null, remindAt, body.note || null],
  );
  return jsonOk({ ok: true, id }, 201);
}
