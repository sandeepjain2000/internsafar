import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';

export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  if (body.status !== 'withdrawn') return jsonError('Only withdraw is supported');

  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const result = await query(
    `UPDATE ip_applications SET status = 'withdrawn', updated_at = now()
     WHERE id = $1 AND candidate_id = $2 RETURNING id`,
    [id, cand.rows[0]?.id],
  );
  if (!result.rows[0]) return jsonError('Application not found', 404);
  return jsonOk({ ok: true });
}
