import crypto from 'crypto';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sendMail } from '@/lib/mail';

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
  schemaReady = true;
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
export async function createTwoFactorChallenge(userId, purpose) {
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
    `INSERT INTO ip_2fa_challenges (id, user_id, purpose, code_hash, expires_at)
     VALUES ($1,$2,$3,$4, now() + interval '10 minutes')`,
    [id, userId, purpose, hashCode(code)],
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
    html: `<p>Hi ${row.name || 'there'},</p>
<p>Your one-time code to <strong>${purposeLabel}</strong> is:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
    text: `Your PlacementHub code to ${purposeLabel} is ${code}. Expires in 10 minutes.`,
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
  if (row.code_hash !== hashCode(otp)) return null;

  await query(`UPDATE ip_2fa_challenges SET consumed_at = now() WHERE id = $1`, [id]);
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
