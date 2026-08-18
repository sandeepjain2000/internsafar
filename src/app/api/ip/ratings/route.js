import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  const result = await query(
    `SELECT r.*, u.name as from_name FROM ip_ratings r JOIN ip_users u ON u.id = r.from_user_id
     WHERE r.to_user_id = $1 ORDER BY r.created_at DESC`,
    [session.user.id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const toUserId = String(body.toUserId || '');
  const stars = Number(body.stars);
  if (!toUserId || !(stars >= 1 && stars <= 5)) return jsonError('toUserId and stars(1-5) are required');

  await query(
    `INSERT INTO ip_ratings (id, internship_id, from_user_id, to_user_id, stars, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [newId('ip_rate'), body.internshipId || null, session.user.id, toUserId, stars, body.comment || null],
  );
  return jsonOk({ ok: true }, 201);
}
