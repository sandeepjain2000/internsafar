import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';

// Mirrors the statuses the applications page offers a Withdraw button for. The UI already
// hides the button outside these, but the check has to live here too or a direct call can
// withdraw an application that is already hired or rejected.
const WITHDRAWABLE_STATUSES = ['applied', 'pending'];

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
     WHERE id = $1 AND candidate_id = $2 AND status = ANY($3::text[]) RETURNING id`,
    [id, cand.rows[0]?.id, WITHDRAWABLE_STATUSES],
  );
  if (!result.rows[0]) {
    // Separate "not yours / gone" from "too late", so the client can say which it is.
    const existing = await query(
      `SELECT status FROM ip_applications WHERE id = $1 AND candidate_id = $2`,
      [id, cand.rows[0]?.id],
    );
    if (!existing.rows[0]) return jsonError('Application not found', 404);
    if (existing.rows[0].status === 'withdrawn') return jsonError('This application is already withdrawn', 409);
    return jsonError(
      `You can only withdraw while an application is still awaiting review. This one is now "${existing.rows[0].status}" — contact the employer instead.`,
      409,
    );
  }
  return jsonOk({ ok: true });
}
