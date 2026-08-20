import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const owns = await query(
    `SELECT id, status FROM ip_internships WHERE id = $1 AND employer_id = $2`,
    [id, emp.rows[0]?.id],
  );
  if (!owns.rows[0]) return jsonError('Not found', 404);
  const stats = await query(
    `SELECT
       count(*)::int AS historical,
       count(*) FILTER (WHERE status = 'hired' OR status = 'accepted')::int AS hired,
       count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
       count(*) FILTER (WHERE status = 'interviewing' OR interview_at IS NOT NULL)::int AS interviewed,
       count(*) FILTER (WHERE status = 'shortlisted')::int AS shortlisted,
       count(*) FILTER (WHERE screening_disabled = true)::int AS screening_disabled
     FROM ip_applications WHERE internship_id = $1`,
    [id],
  );
  return jsonOk({ summary: stats.rows[0] });
}
