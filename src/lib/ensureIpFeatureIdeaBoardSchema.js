import { query } from '@/lib/db';
import { newId } from '@/lib/ids';

let ready = false;

const DEFAULT_CATEGORIES = [
  'Applications',
  'Notifications',
  'AI & Tools',
  'Referrals',
  'UI/UX',
  'General',
];

/** Problem/solution fields, follows, and default category names from the candidate ideas mock. */
export async function ensureIpFeatureIdeaBoardSchema() {
  if (ready) return;
  await query(`
    ALTER TABLE ip_feature_ideas
      ADD COLUMN IF NOT EXISTS problem TEXT,
      ADD COLUMN IF NOT EXISTS solution TEXT
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_feature_idea_follows (
      idea_id TEXT NOT NULL REFERENCES ip_feature_ideas(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (idea_id, user_id)
    )
  `);
  for (const name of DEFAULT_CATEGORIES) {
    try {
      const existing = await query(`SELECT id FROM ip_idea_categories WHERE lower(name) = lower($1)`, [name]);
      if (existing.rows[0]) continue;
      const maxOrder = await query(`SELECT COALESCE(MAX(sort_order), 0) as m FROM ip_idea_categories`);
      await query(`INSERT INTO ip_idea_categories (id, name, sort_order) VALUES ($1,$2,$3)`, [
        newId('ip_ideacat'),
        name,
        Number(maxOrder.rows[0]?.m || 0) + 10,
      ]);
    } catch (e) {
      console.warn('[feature-ideas] category seed', name, e.message);
    }
  }
  ready = true;
}

export function presentFeatureIdea(row) {
  const problem = String(row.problem || '').trim() || String(row.description || '').trim();
  const solution = String(row.solution || '').trim();
  return {
    ...row,
    problem,
    solution,
    voted_by_me: Boolean(row.voted_by_me),
    followed_by_me: Boolean(row.followed_by_me),
  };
}

export function combinedIdeaDescription(problem, solution, fallback = '') {
  const parts = [String(problem || '').trim(), String(solution || '').trim()].filter(Boolean);
  return parts.join('\n\n') || String(fallback || '').trim();
}
