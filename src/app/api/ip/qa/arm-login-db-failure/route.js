import { NextResponse } from 'next/server';
import { armLoginDbFailureOnce, isQaRoutesEnabled } from '@/lib/ipQaSimulate';

export async function POST() {
  if (!isQaRoutesEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  armLoginDbFailureOnce();
  return NextResponse.json({ ok: true, message: 'Next credentials login will simulate DB failure once' });
}
