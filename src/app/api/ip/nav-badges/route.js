import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { ensureIpMessageArchiveSchema } from '@/lib/ensureIpMessageArchiveSchema';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';

/**
 * Compact sidebar badge counts for candidate / employer.
 * Keys match nav hrefs for easy lookup in PortalShell.
 */
export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;

  await ensureIpMessageArchiveSchema();
  await ensureIpNotificationCategorySchema();

  const userId = session.user.id;
  const role = session.user.role;
  const badges = {};

  const unreadNotifs = await query(
    `SELECT count(*)::int AS n FROM ip_notifications
      WHERE user_id = $1 AND read_at IS NULL AND archived_at IS NULL`,
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
    // In-progress applications only. Awaiting Review drops off once the posting is closed/expired
    // or its last date has passed; Under Review / Interview keep counting until the employer decides.
    const activeApps = await query(
      `SELECT count(*)::int AS n
         FROM ip_applications a
         JOIN ip_candidates c ON c.id = a.candidate_id
         JOIN ip_internships i ON i.id = a.internship_id
        WHERE c.user_id = $1
          AND (
            lower(a.status) IN ('shortlisted', 'interviewing')
            OR (
              lower(a.status) IN ('applied', 'pending')
              AND lower(coalesce(i.status, '')) <> 'closed'
              AND (i.apply_ends_at IS NULL OR i.apply_ends_at > now())
            )
          )`,
      [userId],
    );
    const appsN = activeApps.rows[0]?.n || 0;
    if (appsN) badges['/candidate/applications'] = String(appsN);
    if (notifN) badges['/candidate/notifications'] = String(notifN);
    if (msgN) badges['/candidate/messages'] = String(msgN);
  } else if (role === 'employer') {
    if (notifN) badges['/employer/notifications'] = String(notifN);
    if (msgN) badges['/employer/messages'] = String(msgN);
  }

  return jsonOk({ badges });
}
