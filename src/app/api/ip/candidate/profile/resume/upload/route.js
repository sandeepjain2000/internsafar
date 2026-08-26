import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { describeStorageError, isS3Configured, uploadIpBuffer } from '@/lib/s3';
import { validateUploadBuffer, validateUploadMeta } from '@/lib/ipFileUpload';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;

  if (!isS3Configured()) {
    return NextResponse.json(
      {
        error: 'Cloud storage not configured',
        hint: 'Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME (same as Placement Hub).',
      },
      { status: 503 },
    );
  }

  try {
    await ensureIpCandidateProfileSchema();
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file selected.' }, { status: 400 });
    }

    const meta = validateUploadMeta(
      { name: file.name, type: file.type, size: file.size },
      'resume',
    );
    if (!meta.ok) return NextResponse.json({ error: meta.error }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const validated = validateUploadBuffer(buffer, meta.contentType, 'resume');
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

    const uploaded = await uploadIpBuffer({
      keyPrefix: `internship-portal/candidates/${session.user.id}/resume`,
      fileName: file.name || 'resume.pdf',
      contentType: validated.contentType,
      body: buffer,
    });

    const upd = await query(
      `UPDATE ip_candidates SET resume_url = $1, updated_at = NOW()
       WHERE user_id = $2
       RETURNING resume_url`,
      [uploaded.fileUrl, session.user.id],
    );
    if (!upd.rows[0]) {
      return NextResponse.json({ error: 'Candidate profile missing' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      resume_url: upd.rows[0].resume_url,
      fileUrl: uploaded.fileUrl,
      fileName: file.name || 'resume.pdf',
      storage: 's3',
    });
  } catch (e) {
    console.error('[ip] resume upload', e);
    return NextResponse.json({ error: describeStorageError(e) }, { status: 500 });
  }
}
