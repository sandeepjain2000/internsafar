import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  ensureIpAuthSessionsSchema,
  deviceLabelFromUa,
} from '@/lib/ensureIpAuthSessionsSchema';

/** Create a tracked session row after successful credentials login. */
export async function createAuthSession({ userId, userAgent, ip }) {
  await ensureIpAuthSessionsSchema();
  const id = newId('ip_sess');
  const ua = String(userAgent || '').slice(0, 500);
  const label = deviceLabelFromUa(ua);
  await query(
    `INSERT INTO ip_auth_sessions (id, user_id, user_agent, ip, device_label)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, ua || null, ip ? String(ip).slice(0, 80) : null, label],
  );
  return id;
}

/** Returns false if missing/revoked. Touches last_seen at most once per ~2 minutes. */
export async function touchAuthSession(sessionId, userId) {
  if (!sessionId || !userId) return false;
  await ensureIpAuthSessionsSchema();
  const row = await query(
    `SELECT id, revoked_at, last_seen_at FROM ip_auth_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId],
  );
  const sess = row.rows[0];
  if (!sess || sess.revoked_at) return false;
  const last = sess.last_seen_at ? new Date(sess.last_seen_at).getTime() : 0;
  if (Date.now() - last > 120_000) {
    await query(`UPDATE ip_auth_sessions SET last_seen_at = now() WHERE id = $1`, [sessionId]);
  }
  return true;
}

export async function revokeAuthSession({ sessionId, userId }) {
  await ensureIpAuthSessionsSchema();
  await query(
    `UPDATE ip_auth_sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId],
  );
}

export async function revokeOtherAuthSessions({ userId, keepSessionId }) {
  await ensureIpAuthSessionsSchema();
  await query(
    `UPDATE ip_auth_sessions
     SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL AND id <> $2`,
    [userId, keepSessionId],
  );
}
