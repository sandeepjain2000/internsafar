import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { ensureIpAuthSessionsSchema, isMobileUa } from '@/lib/ensureIpAuthSessionsSchema';
import { revokeAuthSession, revokeOtherAuthSessions } from '@/lib/ipAuthSessions';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpAuthSessionsSchema();
  const result = await query(
    `SELECT id, user_agent, ip, device_label, created_at, last_seen_at
     FROM ip_auth_sessions
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY last_seen_at DESC
     LIMIT 50`,
    [session.user.id],
  );
  const currentId = session.user.sessionId || null;
  const items = result.rows.map((r) => ({
    id: r.id,
    deviceLabel: r.device_label || 'Unknown device',
    ip: r.ip || null,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    isCurrent: currentId ? r.id === currentId : false,
    isMobile: isMobileUa(r.user_agent),
  }));
  // If JWT has no matching row, still mark first as current when only one
  if (!items.some((i) => i.isCurrent) && items.length === 1) {
    items[0].isCurrent = true;
  }
  return jsonOk({ items, currentSessionId: currentId });
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const others = url.searchParams.get('others') === '1';

  if (others) {
    const keep = session.user.sessionId;
    if (!keep) return jsonError('Current session is unknown — sign in again', 400);
    await revokeOtherAuthSessions({ userId: session.user.id, keepSessionId: keep });
    return jsonOk({ ok: true });
  }

  if (!id) return jsonError('id or others=1 is required');
  if (session.user.sessionId && id === session.user.sessionId) {
    return jsonError('Cannot revoke the current session here — use Sign out', 400);
  }
  await revokeAuthSession({ sessionId: id, userId: session.user.id });
  return jsonOk({ ok: true });
}
