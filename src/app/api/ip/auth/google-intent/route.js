import { NextResponse } from 'next/server';
import {
  GOOGLE_INTENT_COOKIE,
  GOOGLE_INTENTS,
  GOOGLE_REF_COOKIE,
} from '@/lib/ipGoogleAuth';

/**
 * Arm a Google registration intent, then the client calls signIn('google').
 *
 * With this cookie present, auth.js mints a single-use verification token and returns to
 * the registration form (no portal session). Without the cookie, Google sign-in is login
 * only for accounts already linked in ip_google_identities — password-only accounts are
 * never opened from Google email alone. Nothing here trusts a client-supplied email: the
 * address comes from Google.
 *
 * The cookie is httpOnly so page scripts cannot forge an intent, and short-lived because
 * it only has to survive the round trip to the consent screen.
 */
const INTENT_TTL_SEC = 15 * 60;

export async function POST(request) {
  let purpose = '';
  let referralCode = '';
  try {
    const body = await request.json();
    purpose = String(body?.purpose || '');
    referralCode = String(body?.referralCode || '')
      .trim()
      .slice(0, 64);
  } catch {
    purpose = '';
  }

  const intent = Object.values(GOOGLE_INTENTS).find((i) => i.cookieValue === purpose);
  if (!intent) {
    return NextResponse.json({ error: 'Unknown Google registration intent' }, { status: 400 });
  }

  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INTENT_TTL_SEC,
  };

  const res = NextResponse.json({
    ok: true,
    returnTo: intent.returnTo,
    referralCode: referralCode || null,
  });
  res.cookies.set(GOOGLE_INTENT_COOKIE, intent.cookieValue, cookieOpts);
  // Carry ?ref= across Google OAuth — auth.js appends it when minting ?gv=.
  if (referralCode) {
    res.cookies.set(GOOGLE_REF_COOKIE, referralCode, cookieOpts);
  } else {
    res.cookies.set(GOOGLE_REF_COOKIE, '', { ...cookieOpts, maxAge: 0 });
  }
  return res;
}
