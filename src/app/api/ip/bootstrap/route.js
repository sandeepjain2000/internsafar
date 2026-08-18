import { NextResponse } from 'next/server';
import { ensureIpBootstrap } from '@/lib/ensureIpBootstrap';

export async function POST() {
  try {
    const result = await ensureIpBootstrap();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[ip bootstrap]', e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
