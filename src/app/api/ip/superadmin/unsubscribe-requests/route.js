import { jsonError, jsonOk, requireSession } from '@/lib/apiAuth';
import { listUnsubscribeRequests, UNSUBSCRIBE_STATUS } from '@/lib/ipEmailUnsubscribe';

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
