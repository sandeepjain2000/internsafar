import { jsonError, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { createTwoFactorChallenge, ensureIpTwoFactorSchema } from '@/lib/ipTwoFactor';
import { getOutboundEmailOverride } from '@/lib/mail';

/** Resend login OTP for an open login challenge (no session yet). */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const challengeId = String(body.challengeId || '').trim();
  if (!challengeId) return jsonError('challengeId is required');

  await ensureIpTwoFactorSchema();
  const result = await query(
    `SELECT c.id, c.user_id, c.purpose, c.consumed_at, c.expires_at, u.email
     FROM ip_2fa_challenges c
     JOIN ip_users u ON u.id = c.user_id
     WHERE c.id = $1 LIMIT 1`,
    [challengeId],
  );
  const row = result.rows[0];
  if (!row || row.purpose !== 'login') return jsonError('Challenge not found', 404);
  if (row.consumed_at) return jsonError('Challenge already used', 400);

  try {
    const { challengeId: nextId, email } = await createTwoFactorChallenge(row.user_id, 'login');
    return jsonOk({
      ok: true,
      challengeId: nextId,
      sentToHint: getOutboundEmailOverride() || email,
      message: 'A new verification code was sent.',
    });
  } catch (e) {
    console.error('[auth 2fa resend]', e.message);
    return jsonError(e.message || 'Could not resend code', 500);
  }
}
