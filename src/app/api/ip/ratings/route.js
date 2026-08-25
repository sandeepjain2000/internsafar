import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { requireInternshipEngagement } from '@/lib/ipEngagementRelationship';

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
  const internshipId = String(body.internshipId || '');
  if (!toUserId || !(stars >= 1 && stars <= 5)) return jsonError('toUserId and stars(1-5) are required');

  const employerUserId = session.user.role === 'employer' ? session.user.id : toUserId;
  const candidateUserId = session.user.role === 'employer' ? toUserId : session.user.id;
  const gate = await requireInternshipEngagement(query, {
    internshipId,
    employerUserId,
    candidateUserId,
  });
  if (!gate.ok) return jsonError(gate.error, 400);

  const existing = await query(
    `SELECT id FROM ip_ratings
     WHERE from_user_id = $1 AND to_user_id = $2 AND internship_id = $3
     LIMIT 1`,
    [session.user.id, toUserId, internshipId],
  );
  if (existing.rows[0]) {
    return jsonError('You have already rated this person for this internship', 409);
  }

  await query(
    `INSERT INTO ip_ratings (id, internship_id, from_user_id, to_user_id, stars, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [newId('ip_rate'), internshipId, session.user.id, toUserId, stars, body.comment || null],
  );
  return jsonOk({ ok: true }, 201);
}
