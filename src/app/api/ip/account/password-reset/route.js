import crypto from 'crypto';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { resolveAppOrigin } from '@/lib/ipAppOrigin';

/** Signed-in reset: uses the login email. No captcha (identity already known). */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;

  const existing = await query(`SELECT id, name, email FROM ip_users WHERE id = $1 AND active = true`, [
    session.user.id,
  ]);
  const user = existing.rows[0];
  if (!user?.email) return jsonError('Account email missing', 400);

  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await query(`INSERT INTO ip_password_resets (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)`, [
    newId('ip_reset'),
    user.id,
    token,
    expiresAt,
  ]);
  const resetUrl = `${resolveAppOrigin(request.url)}/forgot-password?token=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Reset your Internship Portal password',
      html: `<p>Hi ${user.name || ''},</p><p>Click to reset your password (valid 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      text: `Reset your password: ${resetUrl}`,
    });
  } catch (mailErr) {
    console.error('[account password-reset] mail failed', mailErr.message);
    if (mailErr.code === 'MAIL_NOT_CONFIGURED') {
      return jsonError('Email is not configured — cannot send a reset link', 503);
    }
    return jsonError('Could not send reset email', 500);
  }

  return jsonOk({
    ok: true,
    message: `If mail delivery succeeded, reset instructions were sent to ${user.email}.`,
  });
}
