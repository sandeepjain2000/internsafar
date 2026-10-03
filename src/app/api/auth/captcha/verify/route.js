import { NextResponse } from 'next/server';
import {
  captchaFailureMessage,
  captchaNonce,
  createCaptchaGate,
  explainCaptchaFailure,
  isCaptchaBypassed,
} from '@/lib/simpleCaptcha';
import { isCaptchaNonceUsed } from '@/lib/ipCaptchaNonce';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    let code = explainCaptchaFailure(body.captchaToken, body.captchaAnswer);
    const nonce = code ? null : captchaNonce(body.captchaToken);
    if (!code && !isCaptchaBypassed() && (!nonce || (await isCaptchaNonceUsed(nonce)))) {
      code = nonce ? 'used' : 'bad_token';
    }
    if (code) {
      return NextResponse.json(
        { ok: false, error: captchaFailureMessage(code), code },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
    const gate = createCaptchaGate(nonce);
    return NextResponse.json(
      { ok: true, gate },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('POST /api/auth/captcha/verify', e);
    return NextResponse.json(
      { ok: false, error: 'Could not verify. Please try again.' },
      { status: 500 },
    );
  }
}
