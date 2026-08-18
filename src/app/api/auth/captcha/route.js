import { NextResponse } from 'next/server';
import { createLoginCaptcha } from '@/lib/simpleCaptcha';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const challenge = createLoginCaptcha();
    return NextResponse.json(challenge, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (e) {
    console.error('GET /api/auth/captcha', e);
    return NextResponse.json({ error: 'Could not create verification challenge' }, { status: 500 });
  }
}
