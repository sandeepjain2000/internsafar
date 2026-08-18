import { query } from '@/lib/db';
import { requireSession } from '@/lib/apiAuth';

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function section(lines, title, headers, rows) {
  lines.push(`Section,${title}`);
  lines.push(headers.join(','));
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  lines.push('');
}

/** SuperAdmin system audit export — operational queues + recent auth events. */
export async function GET() {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;

  const [
    pendingEmployers,
    pendingRequests,
    pendingIdeas,
    pendingDocs,
    pendingViral,
    pendingPromos,
    pendingFormRegs,
    loginEvents,
    liveInternships,
    offers,
  ] = await Promise.all([
    query(
      `SELECT e.id, e.company_name, e.work_email, e.approval_status, e.created_at, u.email
       FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
       WHERE e.approval_status = 'pending'
       ORDER BY e.created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT id, company_name, work_email, status, created_at
       FROM ip_employer_requests WHERE status = 'pending'
       ORDER BY created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT id, title, status, created_at FROM ip_feature_ideas
       WHERE status = 'Pending approval'
       ORDER BY created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT d.id, d.doc_type, d.review_status, d.created_at, e.company_name
       FROM ip_employer_documents d
       JOIN ip_employers e ON e.id = d.employer_id
       WHERE coalesce(d.review_status,'pending') = 'pending'
       ORDER BY d.created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT v.id, v.channel, v.status, v.check_after, v.created_at, u.email
       FROM ip_viral_shares v JOIN ip_users u ON u.id = v.user_id
       WHERE v.status IN ('pending','scheduled','searching','fast_track_pending')
       ORDER BY v.created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT p.id, p.status, p.created_at, i.title, e.company_name
       FROM ip_linkedin_promotions p
       JOIN ip_internships i ON i.id = p.internship_id
       JOIN ip_employers e ON e.id = p.employer_id
       WHERE p.status IN ('pending','scheduled','fast_track_pending','searching')
       ORDER BY p.created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT id, email, name, role, form_approval_status, created_at
       FROM ip_users
       WHERE role = 'candidate' AND registration_source = 'form' AND form_approval_status = 'pending'
       ORDER BY created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT id, email, role, success, created_at
       FROM ip_login_events
       ORDER BY created_at DESC LIMIT 200`,
    ),
    query(
      `SELECT count(*) FILTER (WHERE status='published')::int AS live, count(*)::int AS total FROM ip_internships`,
    ),
    query(
      `SELECT count(*) FILTER (WHERE status='accepted')::int AS accepted, count(*)::int AS total FROM ip_offers`,
    ),
  ]);

  const lines = [];
  const generatedAt = new Date().toISOString();
  section(
    lines,
    'Summary',
    ['generated_at', 'pending_employers', 'pending_requests', 'pending_ideas', 'pending_documents', 'pending_viral', 'pending_promotions', 'pending_form_registrations', 'internships_live', 'internships_total', 'offers_accepted', 'offers_total'],
    [
      [
        generatedAt,
        pendingEmployers.rows.length,
        pendingRequests.rows.length,
        pendingIdeas.rows.length,
        pendingDocs.rows.length,
        pendingViral.rows.length,
        pendingPromos.rows.length,
        pendingFormRegs.rows.length,
        liveInternships.rows[0]?.live ?? 0,
        liveInternships.rows[0]?.total ?? 0,
        offers.rows[0]?.accepted ?? 0,
        offers.rows[0]?.total ?? 0,
      ],
    ],
  );

  section(
    lines,
    'PendingEmployers',
    ['id', 'company_name', 'work_email', 'account_email', 'approval_status', 'created_at'],
    pendingEmployers.rows.map((r) => [r.id, r.company_name, r.work_email, r.email, r.approval_status, r.created_at]),
  );
  section(
    lines,
    'PendingManualRequests',
    ['id', 'company_name', 'work_email', 'status', 'created_at'],
    pendingRequests.rows.map((r) => [r.id, r.company_name, r.work_email, r.status, r.created_at]),
  );
  section(
    lines,
    'PendingFormRegistrations',
    ['id', 'email', 'name', 'role', 'form_approval_status', 'created_at'],
    pendingFormRegs.rows.map((r) => [r.id, r.email, r.name, r.role, r.form_approval_status, r.created_at]),
  );
  section(
    lines,
    'PendingFeatureIdeas',
    ['id', 'title', 'status', 'created_at'],
    pendingIdeas.rows.map((r) => [r.id, r.title, r.status, r.created_at]),
  );
  section(
    lines,
    'PendingDocuments',
    ['id', 'company_name', 'doc_type', 'review_status', 'created_at'],
    pendingDocs.rows.map((r) => [r.id, r.company_name, r.doc_type, r.review_status, r.created_at]),
  );
  section(
    lines,
    'PendingViralShares',
    ['id', 'email', 'channel', 'status', 'check_after', 'created_at'],
    pendingViral.rows.map((r) => [r.id, r.email, r.channel, r.status, r.check_after, r.created_at]),
  );
  section(
    lines,
    'PendingLinkedInPromotions',
    ['id', 'company_name', 'title', 'status', 'created_at'],
    pendingPromos.rows.map((r) => [r.id, r.company_name, r.title, r.status, r.created_at]),
  );
  section(
    lines,
    'RecentLoginEvents',
    ['id', 'email', 'role', 'success', 'created_at'],
    loginEvents.rows.map((r) => [r.id, r.email, r.role, r.success, r.created_at]),
  );

  const stamp = generatedAt.slice(0, 10);
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="superadmin-system-audit-${stamp}.csv"`,
    },
  });
}
