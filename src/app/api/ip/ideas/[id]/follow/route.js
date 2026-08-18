import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpFeatureIdeaBoardSchema } from '@/lib/ensureIpFeatureIdeaBoardSchema';

export async function POST(_request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpFeatureIdeaBoardSchema();
  const { id } = await params;

  const idea = await query(`SELECT id FROM ip_feature_ideas WHERE id = $1`, [id]);
  if (!idea.rows[0]) return jsonError('Idea not found', 404);

  const existing = await query(
    `SELECT 1 FROM ip_feature_idea_follows WHERE idea_id = $1 AND user_id = $2`,
    [id, session.user.id],
  );
  if (existing.rows[0]) {
    await query(`DELETE FROM ip_feature_idea_follows WHERE idea_id = $1 AND user_id = $2`, [
      id,
      session.user.id,
    ]);
    return jsonOk({ ok: true, following: false });
  }
  await query(`INSERT INTO ip_feature_idea_follows (idea_id, user_id) VALUES ($1,$2)`, [
    id,
    session.user.id,
  ]);
  return jsonOk({ ok: true, following: true });
}
