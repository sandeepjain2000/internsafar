import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpDocumentAuditSchema, formatFileSize } from '@/lib/ensureIpDocumentAuditSchema';
import { notifyUser } from '@/lib/ipNotify';

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'rejected') return 'flagged';
  return v;
}

async function setOne(id, reviewStatus, notes, reviewerId) {
  const result = await query(
    `UPDATE ip_employer_documents
     SET review_status = $2, review_notes = $3, reviewed_at = now()
     WHERE id = $1
     RETURNING id, employer_id, file_name, doc_type`,
    [id, reviewStatus, notes || null],
  );
  const row = result.rows[0];
  if (!row) return { ok: false };
  try {
    const emp = await query(`SELECT user_id, company_name FROM ip_employers WHERE id = $1`, [row.employer_id]);
    if (emp.rows[0]) {
      await notifyUser({
        userId: emp.rows[0].user_id,
        title: `Document ${reviewStatus === 'flagged' ? 'rejected' : reviewStatus}`,
        body: `${row.doc_type || 'Document'}${notes ? `: ${notes}` : ''}`,
        link: '/employer/profile',
        category: 'system',
      });
    }
  } catch (e) {
    console.error('[documents review] notify', e.message);
  }
  return { ok: true, reviewedBy: reviewerId };
}

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpDocumentAuditSchema();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const withMeta = searchParams.get('meta') === '1';
  const params = [];
  const where = ['1=1'];
  if (status && status !== 'all') {
    const st = normalizeStatus(status);
    params.push(st);
    where.push(`coalesce(d.review_status,'pending') = $${params.length}`);
  }

  const result = await query(
    `SELECT d.*, e.company_name, e.work_email, e.website, e.approval_status
     FROM ip_employer_documents d
     JOIN ip_employers e ON e.id = d.employer_id
     WHERE ${where.join(' AND ')}
     ORDER BY d.created_at DESC LIMIT 300`,
    params,
  );

  const items = result.rows.map((d) => ({
    ...d,
    file_size_label: formatFileSize(d.file_size),
    display_status: d.review_status === 'flagged' ? 'rejected' : d.review_status || 'pending',
  }));

  if (!withMeta) return jsonOk({ items });

  const [total, pending, approved, rejected] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_employer_documents`),
    query(`SELECT count(*)::int AS n FROM ip_employer_documents WHERE coalesce(review_status,'pending') = 'pending'`),
    query(`SELECT count(*)::int AS n FROM ip_employer_documents WHERE review_status = 'approved'`),
    query(`SELECT count(*)::int AS n FROM ip_employer_documents WHERE review_status = 'flagged'`),
  ]);

  return jsonOk({
    items,
    meta: {
      total: total.rows[0].n,
      pending: pending.rows[0].n,
      approved: approved.rows[0].n,
      rejected: rejected.rows[0].n,
    },
  });
}

export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpDocumentAuditSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const reviewStatus = normalizeStatus(body.reviewStatus || body.review_status || '');
  if (!['approved', 'flagged', 'pending'].includes(reviewStatus)) {
    return jsonError('id and reviewStatus (approved|flagged|rejected|pending) required');
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('id or ids required');

  let ok = 0;
  for (const id of ids) {
    const res = await setOne(id, reviewStatus, body.notes || body.rejectionReason, session.user.id);
    if (res.ok) ok += 1;
  }
  if (!ok) return jsonError('Not found', 404);
  return jsonOk({ ok: true, processed: ok, reviewedBy: session.user.id });
}
