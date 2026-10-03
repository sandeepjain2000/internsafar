import crypto from 'crypto';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { escapeHtml } from '@/lib/escapeHtml';

let schemaReady = false;

/** Email OTP 2FA — enable flag on users + short-lived challenges. */
export async function ensureIpTwoFactorSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false`);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_2fa_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ip_2fa_challenges_user
      ON ip_2fa_challenges(user_id, purpose, created_at DESC)
  `);
  await query(`ALTER TABLE ip_2fa_challenges ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE ip_2fa_challenges ADD COLUMN IF NOT EXISTS bind_hash TEXT`);
  schemaReady = true;
}

/**
 * httpOnly cookie set when the password step succeeds; only the browser holding it may ask
 * for more login codes on that sign-in attempt.
 */
export const TWO_FACTOR_BIND_COOKIE = 'ip_2fa_bind';
export const TWO_FACTOR_BIND_MAX_AGE_SEC = 15 * 60;

export function hashTwoFactorBinding(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest('hex');
}

export function newTwoFactorBinding() {
  const secret = crypto.randomBytes(32).toString('base64url');
  return { secret, hash: hashTwoFactorBinding(secret) };
}

export function twoFactorBindingMatches(secret, storedHash) {
  if (!secret || !storedHash) return false;
  const a = Buffer.from(hashTwoFactorBinding(secret));
  const b = Buffer.from(String(storedHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function twoFactorBindCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TWO_FACTOR_BIND_MAX_AGE_SEC,
  };
}

/** Wrong codes allowed per challenge before it is burned (user must sign in with password again). */
export const MAX_TWO_FACTOR_ATTEMPTS = 5;

/** Login codes a user may be sent per window (password sign-ins + resends together). */
export const MAX_LOGIN_CODES_PER_WINDOW = 5;
export const LOGIN_CODE_WINDOW_MINUTES = 15;

export async function recentLoginChallengeCount(userId) {
  await ensureIpTwoFactorSchema();
  const result = await query(
    `SELECT count(*)::int AS n FROM ip_2fa_challenges
     WHERE user_id = $1 AND purpose = 'login'
       AND created_at > now() - make_interval(mins => $2)`,
    [userId, LOGIN_CODE_WINDOW_MINUTES],
  );
  return Number(result.rows[0]?.n || 0);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

function randomOtp() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * @param {'login'|'enable'|'disable'} purpose
 * @returns {{ challengeId: string, code: string, email: string }}
 */
export async function createTwoFactorChallenge(userId, purpose, { bindHash = null } = {}) {
  await ensureIpTwoFactorSchema();
  const user = await query(`SELECT id, email, name FROM ip_users WHERE id = $1`, [userId]);
  const row = user.rows[0];
  if (!row?.email) throw new Error('User email missing');

  // Invalidate prior open challenges for same purpose
  await query(
    `UPDATE ip_2fa_challenges SET consumed_at = now()
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
    [userId, purpose],
  );

  const code = randomOtp();
  const id = newId('ip_2fa');
  await query(
    `INSERT INTO ip_2fa_challenges (id, user_id, purpose, code_hash, expires_at, bind_hash)
     VALUES ($1,$2,$3,$4, now() + interval '10 minutes', $5)`,
    [id, userId, purpose, hashCode(code), bindHash],
  );

  const purposeLabel =
    purpose === 'enable'
      ? 'enable two-factor authentication'
      : purpose === 'disable'
        ? 'disable two-factor authentication'
        : 'finish signing in';

  await sendMail({
    to: row.email,
    subject: `Your PlacementHub verification code: ${code}`,
    html: `<p>Hi ${escapeHtml(row.name || 'there')},</p>
<p>Your one-time code to <strong>${purposeLabel}</strong> is:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    text: `Your PlacementHub code to ${purposeLabel} is ${code}. Expires in 10 minutes.`,
    skipUnsubscribe: true,
  });

  return { challengeId: id, email: row.email };
}

/**
 * @returns {{ userId: string, purpose: string } | null}
 */
export async function verifyTwoFactorChallenge(challengeId, code) {
  await ensureIpTwoFactorSchema();
  const id = String(challengeId || '').trim();
  const otp = String(code || '').trim();
  if (!id || !/^\d{6}$/.test(otp)) return null;

  const result = await query(
    `SELECT id, user_id, purpose, code_hash, expires_at, consumed_at
     FROM ip_2fa_challenges WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row || row.consumed_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.code_hash !== hashCode(otp)) {
    await query(
      `UPDATE ip_2fa_challenges
       SET failed_attempts = failed_attempts + 1,
           consumed_at = CASE WHEN failed_attempts + 1 >= $2 THEN now() ELSE consumed_at END
       WHERE id = $1 AND consumed_at IS NULL`,
      [id, MAX_TWO_FACTOR_ATTEMPTS],
    );
    return null;
  }

  const claimed = await query(
    `UPDATE ip_2fa_challenges SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
    [id],
  );
  if (!claimed.rowCount) return null;
  return { userId: row.user_id, purpose: row.purpose };
}

export async function isTwoFactorEnabled(userId) {
  await ensureIpTwoFactorSchema();
  const result = await query(`SELECT two_factor_enabled FROM ip_users WHERE id = $1`, [userId]);
  return Boolean(result.rows[0]?.two_factor_enabled);
}

export async function setTwoFactorEnabled(userId, enabled) {
  await ensureIpTwoFactorSchema();
  await query(`UPDATE ip_users SET two_factor_enabled = $2, updated_at = now() WHERE id = $1`, [
    userId,
    Boolean(enabled),
  ]);
}
