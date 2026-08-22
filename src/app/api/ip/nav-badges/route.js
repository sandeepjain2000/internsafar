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
    if (notifN) badges['/candidate/notifications'] = String(notifN);
  } else if (role === 'employer') {
    if (notifN) badges['/employer/notifications'] = String(notifN);
  }

  return jsonOk({ badges });
}
