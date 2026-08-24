import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';

const MAX_PRESETS = 5;

function pipelineKey(internshipId) {
  return `employer.applicants.${internshipId}`;
}

export async function GET(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const internshipId = new URL(request.url).searchParams.get('internshipId') || '';
  if (internshipId) {
    const result = await query(
      `SELECT id, name, filters, sort, is_default, table_key, created_at, updated_at
       FROM ip_saved_applicant_views
       WHERE user_id = $1 AND table_key = $2
       ORDER BY name ASC`,
      [session.user.id, pipelineKey(internshipId)],
    );
    return jsonOk({ items: result.rows });
  }
  const result = await query(
    `SELECT id, name, filters, sort, is_default, table_key, created_at, updated_at
     FROM ip_saved_applicant_views
     WHERE user_id = $1 AND table_key LIKE 'employer.applicants.%'
     ORDER BY table_key ASC, name ASC`,
    [session.user.id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const name = String(body.name || '').trim();
  const internshipId = String(body.internshipId || '').trim();
  if (!name) return jsonError('Name required');
  if (!internshipId) return jsonError('internshipId required');
  const tableKey = pipelineKey(internshipId);
  const count = await query(
    `SELECT count(*)::int AS n FROM ip_saved_applicant_views WHERE user_id = $1 AND table_key = $2`,
    [session.user.id, tableKey],
  );
  if (Number(count.rows[0]?.n || 0) >= MAX_PRESETS) {
    return jsonError('You already have 5 saved views for this list. Delete one to save another.', 400);
  }
  const id = newId('ip_sav');
  try {
    await query(
      `INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, user_id, table_key, sort, is_default, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8, now())`,
      [
        id,
        emp.rows[0]?.id || null,
        name,
        JSON.stringify(body.filters || {}),
        session.user.id,
        tableKey,
        body.sort != null ? String(body.sort) : '',
        Boolean(body.isDefault),
      ],
    );
  } catch (err) {
    if (String(err?.code) === '23505') {
      return jsonError('A preset with that name already exists on this list.');
    }
    throw err;
  }
  return jsonOk({ ok: true, id }, 201);
}

export async function DELETE(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id');
  await query(
    `DELETE FROM ip_saved_applicant_views WHERE id = $1 AND user_id = $2`,
    [id, session.user.id],
  );
  return jsonOk({ ok: true });
}
