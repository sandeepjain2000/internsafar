import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { describeStorageError, getIpObject } from '@/lib/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  const key = new URL(request.url).searchParams.get('key') || '';
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
