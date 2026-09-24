import { transaction } from '@/lib/transaction';
import { newId } from '@/lib/ids';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';

/**
 * Debit POINTS_PER_POST from employer when publishing. Returns error message or null.
 * Uses WHERE points >= cost so concurrent publishes cannot overdraw.
 * Pass an existing `client` to participate in a larger transaction (charge + INSERT).
 */
export async function chargePublishPoints(userId, meta = {}, client = null) {
  const run = async (c) => {
    const debited = await c.query(
      `UPDATE ip_users
       SET points = points - $2, updated_at = now()
       WHERE id = $1 AND points >= $2
       RETURNING points`,
      [userId, POINTS_PER_POST],
    );
    if (!debited.rows[0]) {
      const userRow = await c.query(`SELECT points FROM ip_users WHERE id = $1`, [userId]);
      const points = Number(userRow.rows[0]?.points || 0);
      return `Need ${POINTS_PER_POST} points to publish (you have ${points}). Earn points via referrals and verified shares.`;
    }
    await c.query(
      `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
       VALUES ($1,$2,$3,'posting_spend',$4::jsonb)`,
      [newId('ip_pts'), userId, -POINTS_PER_POST, JSON.stringify(meta)],
    );
    return null;
  };

  if (client) return run(client);
  return transaction(run);
}
