import { NextResponse } from 'next/server';
import {
  captchaFailureMessage,
  createCaptchaGate,
  explainCaptchaFailure,
} from '@/lib/simpleCaptcha';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = explainCaptchaFailure(body.captchaToken, body.captchaAnswer);
    if (code) {
      return NextResponse.json(
        { ok: false, error: captchaFailureMessage(code), code },
        {
          status: 400,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
    const gate = createCaptchaGate();
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
