import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';

async function setOne(id, status, reason, moderatorId) {
  const row = await query(
    `SELECT i.title, e.user_id FROM ip_internships i JOIN ip_employers e ON e.id = i.employer_id WHERE i.id = $1`,
    [id],
  );
  if (!row.rows[0]) return { ok: false };
  await query(`UPDATE ip_internships SET status = $2, updated_at = now() WHERE id = $1`, [id, status]);
  await notifyUser({
    userId: row.rows[0].user_id,
    title: 'Posting moderation update',
    body: `${row.rows[0].title} was set to ${status}${reason ? `: ${reason}` : ''}.`,
    link: '/employer/internships',
    category: 'system',
  });
  return { ok: true, moderatedBy: moderatorId };
}

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const withMeta = searchParams.get('meta') === '1';
  const params = [];
  const where = ['1=1'];
  if (status && status !== 'all') {
    const st = status === 'takedown' ? 'closed' : status;
    params.push(st);
    where.push(`i.status = $${params.length}`);
  }
  const result = await query(
    `SELECT i.*, e.company_name, e.work_email, e.website,
            (SELECT count(*) FROM ip_applications a WHERE a.internship_id = i.id) as applicant_count
     FROM ip_internships i
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE ${where.join(' AND ')}
     ORDER BY i.created_at DESC LIMIT 300`,
    params,
  );

  const items = result.rows.map((i) => ({
    ...i,
    display_status: i.status === 'closed' ? 'takedown' : i.status,
  }));

  if (!withMeta) return jsonOk({ items });

  const [total, live, paused, closed] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_internships`),
    query(`SELECT count(*)::int AS n FROM ip_internships WHERE status = 'published'`),
    query(`SELECT count(*)::int AS n FROM ip_internships WHERE status = 'paused'`),
    query(`SELECT count(*)::int AS n FROM ip_internships WHERE status = 'closed'`),
  ]);

  return jsonOk({
    items,
    meta: {
      total: total.rows[0].n,
      published: live.rows[0].n,
      paused: paused.rows[0].n,
      closed: closed.rows[0].n,
    },
  });
}

export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  let status = String(body.status || '');
  if (status === 'takedown') status = 'closed';
  if (!['published', 'paused', 'closed', 'draft'].includes(status)) {
    return jsonError('id and status (published|paused|closed|draft) required');
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('id or ids required');

  let ok = 0;
  for (const id of ids) {
    const res = await setOne(id, status, body.reason, session.user.id);
    if (res.ok) ok += 1;
  }
  if (!ok) return jsonError('Not found', 404);
  return jsonOk({ ok: true, processed: ok, moderatedBy: session.user.id });
}
