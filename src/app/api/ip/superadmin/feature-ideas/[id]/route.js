import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { ensureIpFeatureIdeaTriageSchema } from '@/lib/ensureIpFeatureIdeaTriageSchema';
import { ensureIpFeatureIdeaBoardSchema } from '@/lib/ensureIpFeatureIdeaBoardSchema';

const ALLOWED = [
  'Pending approval',
  'Under review',
  'In progress',
  'Planned',
  'Shipped',
  'Declined',
];

function normalizeStatus(raw) {
  const s = String(raw || '').trim();
  const map = {
    under_review: 'Under review',
    'under review': 'Under review',
    planned: 'Planned',
    in_progress: 'In progress',
    'in progress': 'In progress',
    completed: 'Shipped',
    shipped: 'Shipped',
    declined: 'Declined',
    'pending approval': 'Pending approval',
  };
  const key = s.toLowerCase();
  if (map[key]) return map[key];
  if (ALLOWED.includes(s)) return s;
  return null;
}

function normalizePriority(raw) {
  if (raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).toLowerCase();
  if (s.includes('p0') || s.includes('critical')) return 1;
  if (s.includes('high')) return 2;
  if (s.includes('medium')) return 3;
  if (s.includes('low')) return 4;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(request, { params }) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpFeatureIdeaTriageSchema();
  await ensureIpFeatureIdeaBoardSchema();
  const { id: routeId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(routeId || body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('id required');

  let processed = 0;
  for (const id of ids) {
    const sets = [];
    const values = [];
    let notifyStatus = null;

    if (body.status !== undefined) {
      const status = normalizeStatus(body.status);
      if (!status) return jsonError(`status must be one of ${ALLOWED.join(', ')}`);
      values.push(status);
      sets.push(`status = $${values.length}`);
      notifyStatus = status;
    }
    if (body.priority !== undefined) {
      const priority = normalizePriority(body.priority);
      values.push(priority);
      sets.push(`priority = $${values.length}`);
    }
    if (body.categoryId !== undefined) {
      values.push(body.categoryId || null);
      sets.push(`category_id = $${values.length}`);
    }
    if (body.adminNote !== undefined || body.admin_note !== undefined) {
      values.push(body.adminNote ?? body.admin_note ?? null);
      sets.push(`admin_note = $${values.length}`);
    }
    if (!sets.length) return jsonError('Nothing to update');

    values.push(id);
    const result = await query(
      `UPDATE ip_feature_ideas SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING author_user_id, title`,
      values,
    );
    const row = result.rows[0];
    if (!row) continue;
    processed += 1;
    const noteChanged = body.adminNote !== undefined || body.admin_note !== undefined;
    const followers = await query(`SELECT user_id FROM ip_feature_idea_follows WHERE idea_id = $1`, [id]);
    const followerIds = new Set(followers.rows.map((f) => f.user_id));
    if (notifyStatus && row.author_user_id) {
      await notifyUser({
        userId: row.author_user_id,
        title: `Your idea is now "${notifyStatus}"`,
        body: row.title,
        link: '/ideas',
        category: 'system',
      });
    }
    if (notifyStatus || noteChanged) {
      const title = notifyStatus
        ? `Idea you follow is now "${notifyStatus}"`
        : 'Product team posted an update on an idea you follow';
      for (const userId of followerIds) {
        if (notifyStatus && userId === row.author_user_id) continue;
        await notifyUser({
          userId,
          title,
          body: row.title,
          link: '/ideas',
          category: 'system',
        });
      }
    }
  }
  if (!processed) return jsonError('Not found', 404);
  return jsonOk({ ok: true, processed });
}
