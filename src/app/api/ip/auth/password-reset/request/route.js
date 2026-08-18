import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { verifyLoginCaptcha, captchaFailureMessage } from '@/lib/simpleCaptcha';

/** Always returns ok:true (does not reveal whether the email exists). */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!verifyLoginCaptcha(body.captchaToken, body.captchaAnswer)) {
    return NextResponse.json({ error: captchaFailureMessage('invalid') }, { status: 400 });
  }

  try {
    const existing = await query(`SELECT id, name FROM ip_users WHERE lower(email) = $1 AND active = true`, [email]);
    const user = existing.rows[0];
    if (user) {
      const token = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await query(
        `INSERT INTO ip_password_resets (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)`,
        [newId('ip_reset'), user.id, token, expiresAt],
      );
      const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/forgot-password?token=${token}`;
      try {
        await sendMail({
          to: email,
          subject: 'Reset your Internship Portal password',
          html: `<p>Hi ${user.name || ''},</p><p>Click to reset your password (valid 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
          text: `Reset your password: ${resetUrl}`,
        });
      } catch (mailErr) {
        console.error('[password-reset request] mail failed', mailErr.message);
      }
    }
  } catch (e) {
    console.error('[password-reset request]', e.message);
  }

  return NextResponse.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
}
