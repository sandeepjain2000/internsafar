import { requireSession, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { ensureIpLoginReportSchema, deviceLabelFromUa } from '@/lib/ensureIpLoginReportSchema';
import { ensureIpAuthSessionsSchema } from '@/lib/ensureIpAuthSessionsSchema';

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpLoginReportSchema();
  await ensureIpAuthSessionsSchema();

  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || '24h';
  const withMeta = searchParams.get('meta') === '1';
  const interval =
    range === '7d' ? '7 days' : range === '30d' ? '30 days' : range === 'all' ? null : '24 hours';

  const where = interval ? `WHERE created_at >= now() - interval '${interval}'` : '';
  const result = await query(
    `SELECT id, email, role, success, ip_address, user_agent, auth_method, failure_reason, location, created_at
     FROM ip_login_events
     ${where}
     ORDER BY created_at DESC
     LIMIT 500`,
  );

  const items = result.rows.map((ev) => ({
    ...ev,
    device_label: deviceLabelFromUa(ev.user_agent),
    auth_label: ev.failure_reason
      ? `${ev.auth_method || 'Password Form'} (${ev.failure_reason})`
      : ev.auth_method || 'Password Form',
  }));

  if (!withMeta) return jsonOk({ items, range });

  const scope = interval ? `AND created_at >= now() - interval '${interval}'` : '';
  const [total, success, failed, sessions] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_login_events WHERE 1=1 ${scope}`),
    query(`SELECT count(*)::int AS n FROM ip_login_events WHERE success = true ${scope}`),
    query(`SELECT count(*)::int AS n FROM ip_login_events WHERE success = false ${scope}`),
    query(
      `SELECT count(*)::int AS n FROM ip_auth_sessions
       WHERE revoked_at IS NULL AND last_seen_at >= now() - interval '30 minutes'`,
    ),
  ]);

  const totalN = total.rows[0].n;
  const successN = success.rows[0].n;
  const rate = totalN ? ((successN / totalN) * 100).toFixed(1) : '0.0';

  return jsonOk({
    items,
    range,
    meta: {
      total: totalN,
      success: successN,
      failed: failed.rows[0].n,
      activeSessions: sessions.rows[0].n,
      successRate: `${rate}%`,
    },
  });
}
