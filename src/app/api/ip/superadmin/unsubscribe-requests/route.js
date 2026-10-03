import { jsonError, jsonOk, requireSession } from '@/lib/apiAuth';
import {
  listUnsubscribeRequests,
  markUnsubscribeRequestsProcessed,
  UNSUBSCRIBE_STATUS,
} from '@/lib/ipEmailUnsubscribe';

/** SuperAdmin: pending unsubscribe requests for later processing. */
export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || UNSUBSCRIBE_STATUS.PENDING).trim().toUpperCase();
  if (!Object.values(UNSUBSCRIBE_STATUS).includes(status)) {
    return jsonError('status must be PENDING or PROCESSED');
  }
  const limit = Number(searchParams.get('limit') || 200);

  try {
    const items = await listUnsubscribeRequests({ status, limit });
    return jsonOk({ items, status });
  } catch (err) {
    console.error('[unsubscribe-requests]', err.message);
    return jsonError('Unable to load unsubscribe requests', 500);
  }
}

/**
 * SuperAdmin: mark PENDING requests processed. Processed addresses stop receiving
 * notification mail; sign-in / security mail (skipUnsubscribe) still sends.
 * Body: { ids: string[] } or { id }
 */
export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const ids = Array.isArray(body.ids) ? body.ids : body.id ? [body.id] : [];
  if (!ids.length) return jsonError('ids is required');
  if (ids.length > 500) return jsonError('Too many ids (max 500)');

  try {
    const processed = await markUnsubscribeRequestsProcessed(ids, session.user.id);
    return jsonOk({ ok: true, processed });
  } catch (err) {
    console.error('[unsubscribe-requests PATCH]', err.message);
    return jsonError('Unable to update unsubscribe requests', 500);
  }
}
