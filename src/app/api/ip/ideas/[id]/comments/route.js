import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { ensureIpFeatureIdeaCommentsSchema } from '@/lib/ensureIpFeatureIdeaCommentsSchema';

export async function GET(_request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpFeatureIdeaCommentsSchema();
  const { id } = await params;
  const idea = await query(`SELECT id FROM ip_feature_ideas WHERE id = $1`, [id]);
  if (!idea.rows[0]) return jsonError('Idea not found', 404);

  const result = await query(
    `SELECT c.id, c.body, c.created_at, c.author_user_id, u.name as author_name, u.role as author_role
     FROM ip_feature_idea_comments c
     LEFT JOIN ip_users u ON u.id = c.author_user_id
     WHERE c.idea_id = $1
     ORDER BY c.created_at ASC`,
    [id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpFeatureIdeaCommentsSchema();
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const text = String(body.body || '').trim();
  if (!text) return jsonError('Comment body is required');
  if (text.length > 2000) return jsonError('Comment is too long (max 2000 characters)');

  const idea = await query(`SELECT id FROM ip_feature_ideas WHERE id = $1`, [id]);
  if (!idea.rows[0]) return jsonError('Idea not found', 404);

  const commentId = newId('ip_idea_cmt');
  await query(
    `INSERT INTO ip_feature_idea_comments (id, idea_id, author_user_id, body)
     VALUES ($1,$2,$3,$4)`,
    [commentId, id, session.user.id, text],
  );
  const row = await query(
    `SELECT c.id, c.body, c.created_at, c.author_user_id, u.name as author_name, u.role as author_role
     FROM ip_feature_idea_comments c
     LEFT JOIN ip_users u ON u.id = c.author_user_id
     WHERE c.id = $1`,
    [commentId],
  );
  return jsonOk({ item: row.rows[0] }, 201);
}
