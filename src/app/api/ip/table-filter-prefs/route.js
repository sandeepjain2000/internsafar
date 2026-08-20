import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

export async function GET(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { searchParams } = new URL(request.url);
  const tableKey = searchParams.get('tableKey') || '';
  if (!tableKey) return jsonError('tableKey required');
  const row = await query(
    `SELECT filters FROM ip_table_filter_prefs WHERE user_id = $1 AND table_key = $2`,
    [session.user.id, tableKey],
  );
  return jsonOk({ filters: row.rows[0]?.filters || null });
}

export async function PUT(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const tableKey = String(body.tableKey || '');
  if (!tableKey) return jsonError('tableKey required');
  const id = newId('ip_tfp');
  await query(
    `INSERT INTO ip_table_filter_prefs (id, user_id, table_key, filters, updated_at)
     VALUES ($1,$2,$3,$4::jsonb, now())
     ON CONFLICT (user_id, table_key)
     DO UPDATE SET filters = EXCLUDED.filters, updated_at = now()`,
    [id, session.user.id, tableKey, JSON.stringify(body.filters || {})],
  );
  return jsonOk({ ok: true });
}
