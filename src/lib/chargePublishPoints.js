import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';

/**
 * Debit POINTS_PER_POST from employer when publishing. Returns error message or null.
 */
export async function chargePublishPoints(userId, meta = {}) {
  const userRow = await query(`SELECT points FROM ip_users WHERE id = $1`, [userId]);
  const points = Number(userRow.rows[0]?.points || 0);
  if (points < POINTS_PER_POST) {
    return `Need ${POINTS_PER_POST} points to publish (you have ${points}). Earn points via referrals and verified shares.`;
  }
  await query(`UPDATE ip_users SET points = points - $2, updated_at = now() WHERE id = $1`, [
    userId,
    POINTS_PER_POST,
  ]);
  await query(
    `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
     VALUES ($1,$2,$3,'posting_spend',$4::jsonb)`,
    [newId('ip_pts'), userId, -POINTS_PER_POST, JSON.stringify(meta)],
  );
  return null;
}
