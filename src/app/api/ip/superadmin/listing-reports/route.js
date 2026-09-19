import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpStudentDiscoveryFeatures } from '@/lib/ensureIpStudentDiscoveryFeatures';

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpStudentDiscoveryFeatures();
  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || 'open').trim();

  const result = await query(
    `SELECT r.*,
            u.email AS reporter_email,
            i.title AS internship_title,
            e.company_name
     FROM ip_listing_reports r
     JOIN ip_users u ON u.id = r.reporter_user_id
     LEFT JOIN ip_internships i ON i.id = r.internship_id
     LEFT JOIN ip_employers e ON e.id = r.employer_id
     WHERE ($1 = 'all' OR r.status = $1)
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [status],
  );

  return jsonOk({ items: result.rows });
}

export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpStudentDiscoveryFeatures();

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  if (!id || !['open', 'reviewed', 'dismissed'].includes(status)) {
    return jsonError('id and status (open|reviewed|dismissed) required', 400);
  }

  await query(
    `UPDATE ip_listing_reports
     SET status = $2, reviewed_at = now(), reviewed_by = $3
     WHERE id = $1`,
    [id, status, session.user.id],
  );
  return jsonOk({ ok: true });
}
