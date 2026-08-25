import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { requireInternshipEngagement } from '@/lib/ipEngagementRelationship';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  if (session.user.role === 'candidate') {
    const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
    const result = await query(
      `SELECT en.*, e.company_name FROM ip_endorsements en LEFT JOIN ip_employers e ON e.id = en.employer_id
       WHERE en.candidate_id = $1 ORDER BY en.created_at DESC`,
      [cand.rows[0]?.id || ''],
    );
    return jsonOk({ items: result.rows });
  }
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const result = await query(
    `SELECT en.*, c.name as candidate_name FROM ip_endorsements en JOIN ip_candidates c ON c.id = en.candidate_id
     WHERE en.employer_id = $1 ORDER BY en.created_at DESC`,
    [emp.rows[0]?.id || ''],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const candidateId = String(body.candidateId || '');
  const internshipId = String(body.internshipId || '');
  if (!candidateId) return jsonError('candidateId is required');

  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  const gate = await requireInternshipEngagement(query, {
    internshipId,
    employerUserId: session.user.id,
    candidateId,
  });
  if (!gate.ok) return jsonError(gate.error, 400);

  const existing = await query(
    `SELECT id FROM ip_endorsements
     WHERE employer_id = $1 AND candidate_id = $2 AND internship_id = $3
     LIMIT 1`,
    [emp.rows[0].id, candidateId, internshipId],
  );
  if (existing.rows[0]) {
    return jsonError('You have already endorsed this candidate for this internship', 409);
  }

  const id = newId('ip_end');
  const certificateText = `This certifies that the candidate completed an internship (${body.roleTitle || 'role'}) with ${emp.rows[0].company_name}${body.periodLabel ? ` during ${body.periodLabel}` : ''}, and is endorsed for: ${(body.skillsEndorsed || []).join(', ') || 'strong performance'}.`;
  await query(
    `INSERT INTO ip_endorsements (id, internship_id, employer_id, candidate_id, role_title, period_label, skills_endorsed, rating_excerpt, certificate_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, internshipId, emp.rows[0].id, candidateId, body.roleTitle || null, body.periodLabel || null, body.skillsEndorsed || [], body.ratingExcerpt || null, certificateText],
  );
  return jsonOk({ ok: true, id, certificateText }, 201);
}
