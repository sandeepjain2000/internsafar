import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

const MAX_PRESETS = 5;
const PRESET_SELECT = `id, table_key, name, filters, sort, is_default, created_at, updated_at`;

function normalizeFilters(filters) {
  if (filters == null) return {};
  if (typeof filters === 'string') {
    try {
      const parsed = JSON.parse(filters);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      return {};
    } catch {
      return {};
    }
  }
  if (typeof filters === 'object' && !Array.isArray(filters)) return filters;
  return {};
}

function mapPresetRow(row) {
  return {
    ...row,
    id: row.id != null ? String(row.id) : row.id,
    filters: normalizeFilters(row.filters),
    sort: row.sort != null ? String(row.sort) : '',
  };
}

export async function GET(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const tableKey = new URL(request.url).searchParams.get('tableKey') || '';
  if (!tableKey) return jsonError('tableKey required');
  const result = await query(
    `SELECT ${PRESET_SELECT}
     FROM ip_saved_applicant_views
     WHERE user_id = $1 AND table_key = $2
     ORDER BY is_default DESC, name ASC`,
    [session.user.id, tableKey],
  );
  return jsonOk({ items: result.rows.map(mapPresetRow) });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const tableKey = String(body.tableKey || '').trim();
  const name = String(body.name || '').trim();
  if (!tableKey) return jsonError('tableKey required');
  if (!name) return jsonError('Name required');
  const count = await query(
    `SELECT count(*)::int AS n FROM ip_saved_applicant_views WHERE user_id = $1 AND table_key = $2`,
    [session.user.id, tableKey],
  );
  if (Number(count.rows[0]?.n || 0) >= MAX_PRESETS) {
    return jsonError('You already have 5 saved views for this list. Delete one to save another.', 400);
  }
  let employerId = null;
  if (session.user.role === 'employer') {
    const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
    employerId = emp.rows[0]?.id || null;
  }
  const id = newId('ip_lpr');
  try {
    await query(
      `INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, user_id, table_key, sort, is_default, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8, now())`,
      [
        id,
        employerId,
        name,
        JSON.stringify(body.filters || {}),
        session.user.id,
        tableKey,
        body.sort != null ? String(body.sort) : '',
        Boolean(body.isDefault),
      ],
    );
  } catch (err) {
    if (String(err?.message || '').includes('ip_saved_views_user_table_name') || String(err?.code) === '23505') {
      return jsonError('A preset with that name already exists on this list.');
    }
    throw err;
  }
  if (body.isDefault) {
    await query(
      `UPDATE ip_saved_applicant_views SET is_default = (id = $3) WHERE user_id = $1 AND table_key = $2`,
      [session.user.id, tableKey, id],
    );
  }
  return jsonOk({ ok: true, id }, 201);
}

export async function PATCH(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const id = String(body.id || '');
  if (!id) return jsonError('id required');
  const row = await query(
    `SELECT id, table_key, is_default FROM ip_saved_applicant_views WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  );
  if (!row.rows[0]) return jsonError('Not found', 404);
  if (typeof body.isDefault === 'boolean') {
    if (body.isDefault) {
      await query(
        `UPDATE ip_saved_applicant_views SET is_default = (id = $3), updated_at = now()
         WHERE user_id = $1 AND table_key = $2`,
        [session.user.id, row.rows[0].table_key, id],
      );
    } else {
      await query(
        `UPDATE ip_saved_applicant_views SET is_default = false, updated_at = now() WHERE id = $1 AND user_id = $2`,
        [id, session.user.id],
      );
    }
  }
  return jsonOk({ ok: true });
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['employer', 'candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('id required');
  await query(`DELETE FROM ip_saved_applicant_views WHERE id = $1 AND user_id = $2`, [id, session.user.id]);
  return jsonOk({ ok: true });
}
