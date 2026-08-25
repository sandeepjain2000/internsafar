import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { describeStorageError, isS3Configured, uploadIpBuffer } from '@/lib/s3';
import { validateUploadBuffer, validateUploadMeta } from '@/lib/ipFileUpload';
import { loadMessageThread } from '@/lib/ipMessageThreadQuery';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;

  const { id } = await params;
  const thread = await loadMessageThread(id, session.user.id);
  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error: 'Cloud storage not configured',
        hint: 'Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME.',
      },
      { status: 503 },
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'No file selected.' }, { status: 400 });
  }

  try {
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file selected.' }, { status: 400 });
    }

    const meta = validateUploadMeta(
      { name: file.name, type: file.type, size: file.size },
      'document',
    );
    if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = validateUploadBuffer(buffer, meta.contentType, 'document');
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const uploaded = await uploadIpBuffer({
      keyPrefix: `internship-portal/messages/${id}`,
      fileName: file.name || 'attachment',
      contentType: validated.contentType,
      body: buffer,
    });

    return NextResponse.json({
      ok: true,
      url: uploaded.fileUrl,
      fileUrl: uploaded.fileUrl,
      name: file.name || 'attachment',
      size: file.size,
      type: validated.contentType,
      storage: 's3',
    });
  } catch (e) {
    console.error('[ip] message attachment upload', e);
    return NextResponse.json({ error: describeStorageError(e) }, { status: 500 });
  }
}
