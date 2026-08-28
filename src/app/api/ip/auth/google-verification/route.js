import { NextResponse } from 'next/server';
import { GOOGLE_INTENTS, peekGoogleVerification } from '@/lib/ipGoogleAuth';

/**
 * Read (without spending) the Google account behind a verification token, so the
 * registration form can show which account was verified. The token is only created
 * by the NextAuth signIn callback after a real Google consent flow.
 */
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const token = params.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    const intent =
      params.get('purpose') === GOOGLE_INTENTS.candidateRegister.cookieValue
        ? GOOGLE_INTENTS.candidateRegister
        : GOOGLE_INTENTS.employerRegister;
    const found = await peekGoogleVerification(token, intent.cookieValue);
    if (!found) {
      return NextResponse.json({ error: 'Verification expired or already used' }, { status: 401 });
    }
    return NextResponse.json({
      ok: true,
      email: found.email,
      name: found.name || '',
      pictureUrl: found.pictureUrl || '',
    });
  } catch (error) {
    console.error('[google-verification]', error);
    return NextResponse.json({ error: 'Could not read verification' }, { status: 500 });
  }
}
