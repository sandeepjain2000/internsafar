import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyRole } from '@/lib/ipNotify';
import { ensureIpFeatureIdeaCommentsSchema } from '@/lib/ensureIpFeatureIdeaCommentsSchema';
import { ensureIpFeatureIdeaTriageSchema } from '@/lib/ensureIpFeatureIdeaTriageSchema';
import {
  combinedIdeaDescription,
  ensureIpFeatureIdeaBoardSchema,
  presentFeatureIdea,
} from '@/lib/ensureIpFeatureIdeaBoardSchema';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpFeatureIdeaCommentsSchema();
  await ensureIpFeatureIdeaTriageSchema();
  await ensureIpFeatureIdeaBoardSchema();
  const result = await query(
    `SELECT fi.*, u.name as author_name, u.role as author_role, c.name as category_name,
            EXISTS(SELECT 1 FROM ip_feature_idea_votes v WHERE v.idea_id = fi.id AND v.user_id = $1) as voted_by_me,
            EXISTS(SELECT 1 FROM ip_feature_idea_follows f WHERE f.idea_id = fi.id AND f.user_id = $1) as followed_by_me,
            (SELECT count(*)::int FROM ip_feature_idea_comments cm WHERE cm.idea_id = fi.id) as comment_count
     FROM ip_feature_ideas fi
     LEFT JOIN ip_users u ON u.id = fi.author_user_id
     LEFT JOIN ip_idea_categories c ON c.id = fi.category_id
     ORDER BY fi.vote_count DESC, fi.created_at DESC`,
    [session.user.id],
  );
  return jsonOk({ items: result.rows.map(presentFeatureIdea) });
}

export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpFeatureIdeaBoardSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const title = String(body.title || '').trim();
  const problem = String(body.problem || '').trim();
  const solution = String(body.solution || '').trim();
  const description = combinedIdeaDescription(problem, solution, body.description);
  if (!title || !description) {
    return jsonError('Title, problem, and proposed improvement are required');
  }
  if (!problem || !solution) {
    return jsonError('Describe the problem and the proposed improvement');
  }
  const categoryId = body.categoryId ? String(body.categoryId) : null;
  if (!categoryId) return jsonError('Category is required');

  const id = newId('ip_idea');
  await query(
    `INSERT INTO ip_feature_ideas (id, author_user_id, title, description, problem, solution, topics, category_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, session.user.id, title, description, problem, solution, body.topics || [], categoryId],
  );
  await query(
    `INSERT INTO ip_feature_idea_follows (idea_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [id, session.user.id],
  );
  await notifyRole({
    role: 'superadmin',
    title: 'New feature idea',
    body: title,
    link: '/superadmin/feature-ideas',
    category: 'system',
  });
  return jsonOk({ ok: true, id }, 201);
}
