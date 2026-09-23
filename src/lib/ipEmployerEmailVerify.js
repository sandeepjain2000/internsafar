import crypto from 'crypto';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { resolveAppOrigin } from '@/lib/ipAppOrigin';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';
import { normalizeEmail } from '@/lib/authRegisterRules';

const TTL_MS = 48 * 60 * 60 * 1000;
let schemaReady = false;

/**
 * Schema only for employer email verify.
 * Do NOT set email_verify_required=false for “legacy” — fill email_verified_at via temp runner instead.
 */
export async function ensureIpEmployerEmailVerifySchema() {
  if (schemaReady) return;
  await ensureIpAccountSettingsSchema();
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS email_verify_required BOOLEAN`);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_employer_email_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(
    `CREATE INDEX IF NOT EXISTS ip_employer_email_verifications_user_idx
     ON ip_employer_email_verifications (user_id)`,
  );
  schemaReady = true;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function employerVerifyEmailHtml({ name, verifyUrl, appName = 'InternSafar' }) {
  const safeName = name || 'there';
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <p>Hi ${safeName},</p>
  <p>Confirm your employer email for ${appName} by opening this link:</p>
  <p><a href="${verifyUrl}">${verifyUrl}</a></p>
  <p>This link expires in 48 hours. After you verify, a SuperAdmin still needs to approve your account before you can post internships.</p>
  <p>— ${appName}</p>
  </body></html>`;
}

/**
 * Issue a verification token and email the link. Does not set email_verified_at.
 * Token is always persisted first; mail failure does not roll back the token
 * (register still returns a warning). Returns mailOk so QA can assert intent.
 */
export async function sendEmployerEmailVerification({ userId, email, name, requestUrl }) {
  await ensureIpEmployerEmailVerifySchema();
  const normalized = normalizeEmail(email);
  const token = crypto.randomBytes(32).toString('hex');
  const id = newId('ip_eev');
  const expiresAt = new Date(Date.now() + TTL_MS);
  await query(
    `UPDATE ip_employer_email_verifications
     SET consumed_at = now()
     WHERE user_id = $1 AND consumed_at IS NULL`,
    [userId],
  );
  await query(
    `INSERT INTO ip_employer_email_verifications (id, user_id, email, token_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, normalized, hashToken(token), expiresAt.toISOString()],
  );
  const origin = resolveAppOrigin(requestUrl);
  const verifyUrl = `${origin}/register/employer/verify?token=${encodeURIComponent(token)}`;
  const subject = 'Verify your InternSafar employer email';
  let mailOk = false;
  let mailError = null;
  try {
    await sendMail({
      to: normalized,
      subject,
      html: employerVerifyEmailHtml({ name, verifyUrl }),
      text: `Hi ${name || 'there'},\nVerify your employer email: ${verifyUrl}\n`,
    });
    mailOk = true;
  } catch (e) {
    mailError = e?.message || String(e);
  }
  return { verifyUrl, token, expiresAt, subject, to: normalized, mailOk, mailError };
}

/**
 * Consume token → set ip_users.email_verified_at.
 */
export async function consumeEmployerEmailVerification(tokenRaw) {
  await ensureIpEmployerEmailVerifySchema();
  const token = String(tokenRaw || '').trim();
  if (!token) return { ok: false, error: 'Missing verification token' };
  const row = await query(
    `SELECT id, user_id, email, expires_at, consumed_at
     FROM ip_employer_email_verifications
     WHERE token_hash = $1
     LIMIT 1`,
    [hashToken(token)],
  );
  const v = row.rows[0];
  if (!v) return { ok: false, error: 'Invalid or expired verification link' };
  if (v.consumed_at) return { ok: false, error: 'This verification link was already used' };
  if (new Date(v.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      error:
        'This verification link has expired. Sign in and use Resend verification email, or use Resend on the registration confirmation screen.',
    };
  }
  await query('BEGIN');
  try {
    await query(
      `UPDATE ip_employer_email_verifications SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`,
      [v.id],
    );
    await query(
      `UPDATE ip_users SET email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1`,
      [v.user_id],
    );
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }
  return { ok: true, userId: v.user_id, email: v.email };
}
