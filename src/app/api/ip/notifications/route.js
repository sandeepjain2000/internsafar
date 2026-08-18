import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';
import {
  decorateCandidateNotification,
  ensureCandidateOfferExpiryNotices,
  loadCandidateNotificationContext,
} from '@/lib/ipCandidateNotificationPresentation';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpNotificationCategorySchema();

  if (session.user.role === 'candidate') {
    await ensureCandidateOfferExpiryNotices(session.user.id).catch(() => {});
  }

  const withMeta = new URL(request.url).searchParams.get('meta') === '1';
  const result = await query(
    `SELECT * FROM ip_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [session.user.id],
  );
  let items = result.rows;

  if (session.user.role === 'candidate') {
    const ctx = await loadCandidateNotificationContext(session.user.id);
    items = items.map((n) => decorateCandidateNotification(n, ctx));
  }

  if (!withMeta) return jsonOk({ items });

  const unread = items.filter((n) => !n.read_at).length;
  return jsonOk({
    items,
    meta: {
      total: items.length,
      unresolved: unread,
      resolved: items.length - unread,
    },
  });
}

export async function PATCH(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  if (body.markAllRead) {
    await query(`UPDATE ip_notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [
      session.user.id,
    ]);
    return jsonOk({ ok: true });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : body.id
      ? [String(body.id)]
      : [];
  if (!ids.length) return jsonError('id, ids, or markAllRead is required');

  const result = await query(
    `UPDATE ip_notifications
     SET read_at = now()
     WHERE user_id = $1 AND id = ANY($2::text[]) AND read_at IS NULL
     RETURNING id`,
    [session.user.id, ids],
  );
  return jsonOk({ ok: true, processed: result.rows.length });
}
