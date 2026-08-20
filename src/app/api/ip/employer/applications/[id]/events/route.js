import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const owned = await query(
    `SELECT a.id FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE a.id = $1 AND i.employer_id = $2`,
    [id, emp.rows[0]?.id],
  );
  if (!owned.rows[0]) return jsonError('Not found', 404);
  const result = await query(
    `SELECT * FROM ip_application_events WHERE application_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [id],
  );
  return jsonOk({ items: result.rows });
}
