import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { describeStorageError, isS3Configured, uploadIpBuffer } from '@/lib/s3';
import { validateUploadBuffer, validateUploadMeta } from '@/lib/ipFileUpload';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Store an offer letter for the signed-in employer. The offer row saves the returned fileUrl. */
export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;

  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error: 'Cloud storage not configured',
        hint: 'Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME.',
      },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file selected.' }, { status: 400 });
    }

    const meta = validateUploadMeta(
      { name: file.name, type: file.type, size: file.size },
      'resume',
    );
    if (!meta.ok) {
      const message = meta.error === 'Please use a PDF, DOC, or DOCX resume file.'
        ? 'Please use a PDF, DOC, or DOCX offer letter.'
        : meta.error;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = validateUploadBuffer(buffer, meta.contentType, 'resume');
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const uploaded = await uploadIpBuffer({
      keyPrefix: `internship-portal/employers/${session.user.id}/offer-letters`,
      fileName: file.name || 'offer-letter.pdf',
      contentType: validated.contentType,
      body: buffer,
    });

    return NextResponse.json({
      ok: true,
      fileUrl: uploaded.fileUrl,
      fileName: file.name || 'offer-letter.pdf',
      storage: 's3',
    });
  } catch (e) {
    console.error('[ip] offer letter upload', e);
    return NextResponse.json({ error: describeStorageError(e) }, { status: 500 });
  }
}
