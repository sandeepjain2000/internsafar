import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { describeStorageError, isS3Configured, uploadIpBuffer } from '@/lib/s3';
import { validateUploadBuffer, validateUploadMeta } from '@/lib/ipFileUpload';
import { ensureIpDocumentAuditSchema } from '@/lib/ensureIpDocumentAuditSchema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpDocumentAuditSchema();

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
    const formData = await request.formData();
    const file = formData.get('file');
    const docType = String(formData.get('docType') || '').trim() || 'Other';
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

    const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
    if (!emp.rows[0]) return NextResponse.json({ error: 'Employer profile missing' }, { status: 404 });

    const uploaded = await uploadIpBuffer({
      keyPrefix: `internship-portal/employers/${session.user.id}/documents`,
      fileName: file.name || 'document.pdf',
      contentType: validated.contentType,
      body: buffer,
    });

    const id = newId('ip_doc');
    await query(
      `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, file_size)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, emp.rows[0].id, docType, file.name || null, uploaded.fileUrl, Number(file.size) || null],
    );

    return NextResponse.json({
      ok: true,
      id,
      url: uploaded.fileUrl,
      fileName: file.name,
      storage: 's3',
    });
  } catch (e) {
    console.error('[ip] document upload', e);
    return NextResponse.json({ error: describeStorageError(e) }, { status: 500 });
  }
}
