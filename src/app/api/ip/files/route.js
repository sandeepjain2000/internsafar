import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { canAccessIpObject } from '@/lib/ipFileAccess';
import { describeStorageError, getIpObject } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!(await canAccessIpObject(session, key))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const object = await getIpObject(key);
    const bytes = await object.Body.transformToByteArray();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': object.ContentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: describeStorageError(e) }, { status: 404 });
  }
}
