import { NextResponse } from 'next/server';
import { GOOGLE_INTENT_COOKIE, GOOGLE_INTENTS } from '@/lib/ipGoogleAuth';

/**
 * Arm a Google registration intent, then the client calls signIn('google').
 *
 * The signIn callback in src/lib/auth.js refuses every Google sign-in that does not carry
 * this cookie, because a Google login would otherwise hand an existing portal account to
 * whoever controls that Google address. With the cookie present it mints a single-use
 * verification token and redirects back to the registration form instead of creating a
 * session. Nothing here trusts a client-supplied email: the address comes from Google.
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
