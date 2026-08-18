import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpEmployerApprovalSchema();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const withMeta = searchParams.get('meta') === '1';
  const where = status ? `WHERE e.approval_status = $1` : '';
  const params = status ? [status] : [];

  const result = await query(
    `SELECT e.*, u.email as account_email, u.name as account_name
     FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
     ${where} ORDER BY e.created_at DESC
     LIMIT 500`,
    params,
  );

  const employerIds = result.rows.map((r) => r.id);
  let docsByEmployer = {};
  if (employerIds.length) {
    const docs = await query(
      `SELECT id, employer_id, doc_type, file_name, url, review_status, created_at
       FROM ip_employer_documents
       WHERE employer_id = ANY($1::text[])
       ORDER BY created_at DESC`,
      [employerIds],
    );
    for (const d of docs.rows) {
      if (!docsByEmployer[d.employer_id]) docsByEmployer[d.employer_id] = [];
      docsByEmployer[d.employer_id].push(d);
    }
  }

  const items = result.rows.map((e) => ({
    ...e,
    documents: docsByEmployer[e.id] || [],
  }));

  if (!withMeta) return jsonOk({ items });

  const [pending, approvedWeek, rejected] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_employers WHERE approval_status = 'pending'`),
    query(
      `SELECT count(*)::int AS n FROM ip_employers
       WHERE approval_status = 'approved'
         AND coalesce(approval_reviewed_at, updated_at) >= now() - interval '7 days'`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_employers WHERE approval_status = 'rejected'`),
  ]);

  const triage = await query(
    `SELECT avg(extract(epoch from (coalesce(approval_reviewed_at, updated_at) - created_at)) / 3600.0) AS hours
     FROM ip_employers
     WHERE approval_status IN ('approved','rejected')
       AND coalesce(approval_reviewed_at, updated_at) IS NOT NULL
       AND coalesce(approval_reviewed_at, updated_at) >= now() - interval '30 days'`,
  );

  return jsonOk({
    items,
    meta: {
      pending: pending.rows[0].n,
      approvedThisWeek: approvedWeek.rows[0].n,
      rejected: rejected.rows[0].n,
      avgTriageHours: triage.rows[0]?.hours != null ? Number(triage.rows[0].hours) : null,
    },
  });
}
