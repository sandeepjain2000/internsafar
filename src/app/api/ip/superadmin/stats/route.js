import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';

export async function GET() {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;

  const [
    candidates,
    employers,
    pendingEmployers,
    internships,
    applications,
    offers,
    requests,
    ideas,
    pendingDocs,
    pendingViral,
    pendingPromos,
    pendingFormRegs,
    unreadNotifs,
    pendingEmployerPreview,
  ] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_users WHERE role = 'candidate'`),
    query(`SELECT count(*)::int AS n FROM ip_users WHERE role = 'employer'`),
    query(`SELECT count(*)::int AS n FROM ip_employers WHERE approval_status = 'pending'`),
    query(
      `SELECT count(*) FILTER (WHERE status='published')::int AS live, count(*)::int AS total FROM ip_internships`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_applications`),
    query(
      `SELECT count(*) FILTER (WHERE status='accepted')::int AS accepted, count(*)::int AS total FROM ip_offers`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_employer_requests WHERE status = 'pending'`),
    query(`SELECT count(*)::int AS n FROM ip_feature_ideas WHERE status = 'Pending approval'`),
    query(
      `SELECT count(*)::int AS n FROM ip_employer_documents WHERE coalesce(review_status,'pending') = 'pending'`,
    ),
    query(
      `SELECT count(*)::int AS n FROM ip_viral_shares
       WHERE status IN ('pending','scheduled','searching','fast_track_pending')`,
    ),
    query(
      `SELECT count(*)::int AS n FROM ip_linkedin_promotions
       WHERE status IN ('pending','scheduled','fast_track_pending','searching')`,
    ),
    query(
      `SELECT count(*)::int AS n FROM ip_users
       WHERE role = 'candidate' AND registration_source = 'form' AND form_approval_status = 'pending'`,
    ),
    query(
      `SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1 AND read_at IS NULL`,
      [session.user.id],
    ),
    query(
      `SELECT e.id, e.company_name, e.work_email, e.website, e.contact_name, e.created_at,
              u.email AS account_email
       FROM ip_employers e
       JOIN ip_users u ON u.id = e.user_id
       WHERE e.approval_status = 'pending'
       ORDER BY e.created_at ASC
       LIMIT 5`,
    ),
  ]);

  const docsForPending = pendingEmployerPreview.rows.length
    ? await query(
        `SELECT employer_id, doc_type, review_status
         FROM ip_employer_documents
         WHERE employer_id = ANY($1::text[])`,
        [pendingEmployerPreview.rows.map((r) => r.id)],
      )
    : { rows: [] };

  const docsByEmployer = {};
  for (const d of docsForPending.rows) {
    if (!docsByEmployer[d.employer_id]) docsByEmployer[d.employer_id] = [];
    docsByEmployer[d.employer_id].push(d.doc_type || 'Document');
  }

  const pendingEmployersList = pendingEmployerPreview.rows.map((e) => ({
    id: e.id,
    name: e.company_name || 'Employer',
    domain: (() => {
      try {
        if (e.website) return new URL(e.website.startsWith('http') ? e.website : `https://${e.website}`).hostname;
      } catch {
        /* ignore */
      }
      const email = e.work_email || e.account_email || '';
      return email.includes('@') ? email.split('@')[1] : '—';
    })(),
    contact: e.work_email || e.account_email || e.contact_name || '—',
    docs: (docsByEmployer[e.id] || []).join(', ') || 'No docs uploaded',
    date: e.created_at,
    status: 'Pending Review',
  }));

  return jsonOk({
    candidates: candidates.rows[0].n,
    employers: employers.rows[0].n,
    pendingEmployers: pendingEmployers.rows[0].n,
    internships: internships.rows[0],
    applications: applications.rows[0].n,
    offers: offers.rows[0],
    pendingRequests: requests.rows[0].n,
    pendingIdeas: ideas.rows[0].n,
    pendingDocuments: pendingDocs.rows[0].n,
    pendingViral: pendingViral.rows[0].n,
    pendingPromotions: pendingPromos.rows[0].n,
    pendingFormRegistrations: pendingFormRegs.rows[0].n,
    unreadMessages: unreadNotifs.rows[0].n,
    pendingEmployersList,
  });
}
