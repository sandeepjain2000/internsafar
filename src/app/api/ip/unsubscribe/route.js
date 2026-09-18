import { NextResponse } from 'next/server';
import { jsonError, jsonOk } from '@/lib/apiAuth';
import { recordUnsubscribeRequest } from '@/lib/ipEmailUnsubscribe';

/** Public token endpoint: record a PENDING unsubscribe request. Does not disable mail. */
export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token');
  try {
    const result = await recordUnsubscribeRequest(token);
    if (!result.ok) {
      return jsonError('This unsubscribe link is invalid.', 400);
    }
    return jsonOk({
      ok: true,
      status: result.status,
      alreadyRecorded: Boolean(result.duplicate),
      message: 'Unsubscribe request received. Emails have not been turned off yet.',
    });
  } catch (err) {
    console.error('[unsubscribe api]', err.message);
    return NextResponse.json({ error: 'Unable to record unsubscribe request' }, { status: 500 });
  }
}
