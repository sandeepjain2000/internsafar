import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { ensureIpMessageArchiveSchema } from '@/lib/ensureIpMessageArchiveSchema';

/**
 * Compact sidebar badge counts for candidate / employer.
 * Keys match nav hrefs for easy lookup in PortalShell.
 */
export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;

  await ensureIpMessageArchiveSchema();

  const userId = session.user.id;
  const role = session.user.role;
  const badges = {};

  const unreadNotifs = await query(
    `SELECT count(*)::int AS n FROM ip_notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  const notifN = unreadNotifs.rows[0]?.n || 0;

  const unreadMsgs = await query(
    `SELECT coalesce(sum(sub.unread),0)::int AS n FROM (
       SELECT (SELECT count(*) FROM ip_messages m
               WHERE m.thread_id = t.id AND m.sender_user_id != $1 AND m.read_at IS NULL) AS unread
       FROM ip_message_threads t
       WHERE (t.candidate_user_id = $1 OR t.employer_user_id = $1)
         AND (
           ($2::text = 'candidate' AND t.candidate_archived_at IS NULL)
           OR ($2::text = 'employer' AND t.employer_archived_at IS NULL)
           OR $2::text NOT IN ('candidate','employer')
         )
     ) sub`,
    [userId, role],
  );
  const msgN = unreadMsgs.rows[0]?.n || 0;

  if (role === 'candidate') {
    const apps = await query(
      `SELECT count(*)::int AS n FROM ip_applications a
       JOIN ip_candidates c ON c.id = a.candidate_id
       WHERE c.user_id = $1 AND lower(coalesce(a.status,'')) NOT IN ('withdrawn','declined')`,
      [userId],
    );
    const offers = await query(
      `SELECT count(*)::int AS n FROM ip_offers o
       JOIN ip_candidates c ON c.id = o.candidate_id
       WHERE c.user_id = $1
         AND lower(coalesce(o.status,'pending')) = 'pending'
         AND (o.valid_until IS NULL OR o.valid_until >= CURRENT_DATE)`,
      [userId],
    );
    if (apps.rows[0]?.n) badges['/candidate/applications'] = String(apps.rows[0].n);
    if (msgN) badges['/candidate/messages'] = String(msgN);
    if (offers.rows[0]?.n) badges['/candidate/offers'] = String(offers.rows[0].n);
    if (notifN) badges['/candidate/notifications'] = String(notifN);
    badges['/candidate/referral'] = 'Hot';
  } else if (role === 'employer') {
    const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [userId]);
    const employerId = emp.rows[0]?.id;
    if (employerId) {
      const posts = await query(
        `SELECT count(*)::int AS n FROM ip_internships WHERE employer_id = $1 AND status = 'published'`,
        [employerId],
      );
      const offers = await query(
        `SELECT count(*)::int AS n FROM ip_offers WHERE employer_id = $1 AND lower(coalesce(status,'pending')) = 'pending'`,
        [employerId],
      );
      if (posts.rows[0]?.n) badges['/employer/internships'] = `${posts.rows[0].n} Active`;
      if (offers.rows[0]?.n) badges['/employer/offers'] = String(offers.rows[0].n);
    }
    if (msgN) badges['/employer/messages'] = String(msgN);
    if (notifN) badges['/employer/notifications'] = String(notifN);
    badges['/employer/referral'] = 'Hot';
  }

  return jsonOk({ badges });
}
