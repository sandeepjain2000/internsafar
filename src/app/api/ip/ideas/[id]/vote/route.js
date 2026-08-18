import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  const { id } = await params;

  const existing = await query(`SELECT 1 FROM ip_feature_idea_votes WHERE idea_id = $1 AND user_id = $2`, [id, session.user.id]);
  if (existing.rows[0]) {
    await query(`DELETE FROM ip_feature_idea_votes WHERE idea_id = $1 AND user_id = $2`, [id, session.user.id]);
    await query(`UPDATE ip_feature_ideas SET vote_count = vote_count - 1 WHERE id = $1`, [id]);
    return jsonOk({ ok: true, voted: false });
  }
  await query(`INSERT INTO ip_feature_idea_votes (idea_id, user_id) VALUES ($1,$2)`, [id, session.user.id]);
  await query(`UPDATE ip_feature_ideas SET vote_count = vote_count + 1 WHERE id = $1`, [id]);
  return jsonOk({ ok: true, voted: true });
}
