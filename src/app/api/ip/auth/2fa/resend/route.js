import { jsonError, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import {
  createTwoFactorChallenge,
  ensureIpTwoFactorSchema,
  LOGIN_CODE_WINDOW_MINUTES,
  MAX_LOGIN_CODES_PER_WINDOW,
  recentLoginChallengeCount,
  TWO_FACTOR_BIND_COOKIE,
  twoFactorBindCookieOptions,
  twoFactorBindingMatches,
} from '@/lib/ipTwoFactor';

/**
 * Resend login OTP for an open login challenge (no session yet). Only the browser that passed
 * the password step (holds the bind cookie) may ask for another code.
 */
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
    `SELECT c.id, c.user_id, c.purpose, c.consumed_at, c.expires_at, c.bind_hash, u.email
     FROM ip_2fa_challenges c
     JOIN ip_users u ON u.id = c.user_id
     WHERE c.id = $1 LIMIT 1`,
    [challengeId],
  );
  const row = result.rows[0];
  if (!row || row.purpose !== 'login') return jsonError('Challenge not found', 404);

  const bindSecret = request.cookies.get(TWO_FACTOR_BIND_COOKIE)?.value || '';
  if (!twoFactorBindingMatches(bindSecret, row.bind_hash)) {
    return jsonError(
      'This sign-in attempt cannot be continued here. Sign in again with your email and password.',
      403,
    );
  }
  if (row.consumed_at) {
    return jsonError('This sign-in attempt has ended. Sign in again with your email and password.', 400);
  }
  if ((await recentLoginChallengeCount(row.user_id)) >= MAX_LOGIN_CODES_PER_WINDOW) {
    return jsonError(
      `Too many codes requested. Wait ${LOGIN_CODE_WINDOW_MINUTES} minutes, then sign in again.`,
      429,
    );
  }

  try {
    const { challengeId: nextId, email } = await createTwoFactorChallenge(row.user_id, 'login', {
      bindHash: row.bind_hash,
    });
    const res = jsonOk({
      ok: true,
      challengeId: nextId,
      sentToHint: email,
      message: 'A new verification code was sent.',
    });
    res.cookies.set(TWO_FACTOR_BIND_COOKIE, bindSecret, twoFactorBindCookieOptions());
    return res;
  } catch (e) {
    console.error('[auth 2fa resend]', e.message);
    return jsonError(e.message || 'Could not resend code', 500);
  }
}
