import { NextResponse } from 'next/server';
import { GOOGLE_INTENT_COOKIE, GOOGLE_INTENTS } from '@/lib/ipGoogleAuth';

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
  try {
    const body = await request.json();
    purpose = String(body?.purpose || '');
  } catch {
    purpose = '';
  }

  const intent = Object.values(GOOGLE_INTENTS).find((i) => i.cookieValue === purpose);
  if (!intent) {
    return NextResponse.json({ error: 'Unknown Google registration intent' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, returnTo: intent.returnTo });
  res.cookies.set(GOOGLE_INTENT_COOKIE, intent.cookieValue, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INTENT_TTL_SEC,
  });
  return res;
}
