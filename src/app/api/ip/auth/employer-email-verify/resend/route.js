import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { normalizeEmail } from '@/lib/authRegisterRules';
import {
  ensureIpEmployerEmailVerifySchema,
  sendEmployerEmailVerification,
} from '@/lib/ipEmployerEmailVerify';

const COOLDOWN_MS = 45 * 1000;

/**
 * Resend employer email-verification link.
 * Anti-enumeration: always returns ok for well-formed emails (except cooldown / mail hard fail).
 * Candidates and already-verified employers get the same generic success (no extra mail).
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const genericOk = {
    ok: true,
    message: 'If that email needs verification, a new link has been sent. Check your inbox.',
    cooldownSec: Math.ceil(COOLDOWN_MS / 1000),
  };

  try {
    await ensureIpEmployerEmailVerifySchema();
    const userRow = await query(
      `SELECT id, email, name, role, email_verified_at, email_verify_required
       FROM ip_users
       WHERE lower(email) = $1
       LIMIT 1`,
      [email],
    );
    const user = userRow.rows[0];
    if (!user || user.role !== 'employer') {
      return NextResponse.json(genericOk);
    }

    const verifyRequired = user.email_verify_required !== false;
    if (!verifyRequired || user.email_verified_at) {
      return NextResponse.json(genericOk);
    }

    const recent = await query(
      `SELECT created_at
       FROM ip_employer_email_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id],
    );
    const lastAt = recent.rows[0]?.created_at ? new Date(recent.rows[0].created_at).getTime() : 0;
    const waitMs = lastAt ? COOLDOWN_MS - (Date.now() - lastAt) : 0;
    if (waitMs > 0) {
      return NextResponse.json(
        {
          error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another verification email.`,
          code: 'COOLDOWN',
          retryAfterSec: Math.ceil(waitMs / 1000),
        },
        { status: 429 },
      );
    }

    const sent = await sendEmployerEmailVerification({
      userId: user.id,
      email: user.email,
      name: user.name,
      requestUrl: request.url,
    });
    if (!sent.mailOk) {
      console.error('[employer-email-verify resend] mail failed', sent.mailError);
      return NextResponse.json(
        { error: 'Could not send verification email right now. Try again in a minute.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...genericOk,
      mailed: true,
    });
  } catch (e) {
    console.error('[employer-email-verify resend]', e.message);
    return NextResponse.json({ error: 'Could not resend verification email' }, { status: 500 });
  }
}
