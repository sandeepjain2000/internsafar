import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';

/** Feature-idea categories (migration 007: ip_idea_categories). */
export async function GET() {
  const { error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  const result = await query(`SELECT * FROM ip_idea_categories ORDER BY sort_order ASC, name ASC`);
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const name = String(body.name || '').trim();
  if (!name) return jsonError('name is required');

  const existing = await query(`SELECT * FROM ip_idea_categories WHERE lower(name) = lower($1)`, [name]);
  if (existing.rows[0]) return jsonOk({ ok: true, item: existing.rows[0] });

  const maxOrder = await query(`SELECT COALESCE(MAX(sort_order), 0) as m FROM ip_idea_categories`);
  const id = newId('ip_ideacat');
  const inserted = await query(
    `INSERT INTO ip_idea_categories (id, name, sort_order) VALUES ($1,$2,$3) RETURNING *`,
    [id, name, Number(maxOrder.rows[0]?.m || 0) + 10],
  );
  return jsonOk({ ok: true, item: inserted.rows[0] }, 201);
}
