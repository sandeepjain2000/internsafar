import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import {
  decorateCandidateNotification,
  ensureCandidateOfferExpiryNotices,
  ensureCandidateSavedClosingNotices,
  loadCandidateNotificationContext,
} from '@/lib/ipCandidateNotificationPresentation';
import { decorateEmployerNotifications } from '@/lib/ipEmployerNotificationPresentation';
import { annotateNotificationsTargetAvailability } from '@/lib/ipNotificationTargetAvailability';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpNotificationCategorySchema();
  await ensureIpApplicationInterviewSchema();

  if (session.user.role === 'candidate') {
    await ensureCandidateOfferExpiryNotices(session.user.id).catch(() => {});
    await ensureCandidateSavedClosingNotices(session.user.id).catch((e) => console.warn('[saved closing notices]', e.message));
  }

  const withMeta = new URL(request.url).searchParams.get('meta') === '1';
  const result = await query(
    `SELECT * FROM ip_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [session.user.id],
  );
  let items = result.rows;

  if (session.user.role === 'candidate') {
    const ctx = await loadCandidateNotificationContext(session.user.id);
    items = items.map((n) => decorateCandidateNotification(n, ctx));
  } else if (session.user.role === 'employer') {
    items = await decorateEmployerNotifications(items, session.user.id);
  }

  items = await annotateNotificationsTargetAvailability(query, items);

  if (!withMeta) return jsonOk({ items });

  const inbox = items.filter((n) => !n.archived_at);
  const unread = inbox.filter((n) => !n.read_at).length;
  return jsonOk({
    items,
    meta: {
      total: inbox.length,
      unresolved: unread,
      resolved: inbox.length - unread,
      archived: items.length - inbox.length,
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

  if (typeof body.archive === 'boolean') {
    await ensureIpNotificationCategorySchema();
    const moved = await query(
      body.archive
        ? `UPDATE ip_notifications SET archived_at = now()
           WHERE user_id = $1 AND id = ANY($2::text[]) AND archived_at IS NULL
           RETURNING id`
        : `UPDATE ip_notifications SET archived_at = NULL
           WHERE user_id = $1 AND id = ANY($2::text[]) AND archived_at IS NOT NULL
           RETURNING id`,
      [session.user.id, ids],
    );
    return jsonOk({ ok: true, processed: moved.rows.length });
  }

  const result = await query(
    `UPDATE ip_notifications
     SET read_at = now()
     WHERE user_id = $1 AND id = ANY($2::text[]) AND read_at IS NULL
     RETURNING id`,
    [session.user.id, ids],
  );
  return jsonOk({ ok: true, processed: result.rows.length });
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  if (session.user.role !== 'superadmin') {
    return jsonError('Only SuperAdmin can delete notifications. Archive them instead.', 403);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { searchParams } = new URL(request.url);
  const qid = String(searchParams.get('id') || '').trim();
  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : body.id
      ? [String(body.id)]
      : qid
        ? [qid]
        : [];
  if (!ids.length) return jsonError('id or ids required');

  const result = await query(
    `DELETE FROM ip_notifications
     WHERE user_id = $1 AND id = ANY($2::text[])
     RETURNING id`,
    [session.user.id, ids],
  );
  return jsonOk({ ok: true, deleted: result.rows.length });
}
