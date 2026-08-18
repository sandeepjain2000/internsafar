import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';

/** List saved internships for the candidate. */
export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  const cand = await query(`SELECT id, skills FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT i.*, e.company_name, e.show_hiring_numbers, s.created_at as saved_at
     FROM ip_saved_internships s
     JOIN ip_internships i ON i.id = s.internship_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE s.candidate_id = $1
     ORDER BY s.created_at DESC`,
    [cand.rows[0].id],
  );
  const skills = cand.rows[0].skills || [];
  const items = result.rows.map((r) => {
    const elig = r.eligibility?.skills;
    let match_score = 100;
    if (Array.isArray(elig) && elig.length) {
      const have = new Set(skills.map((s) => String(s).toLowerCase()));
      match_score = Math.round((elig.filter((s) => have.has(String(s).toLowerCase())).length / elig.length) * 100);
    }
    return {
      ...r,
      company_name: r.show_employer_identity ? r.company_name : 'Confidential employer',
      match_score,
      saved: true,
    };
  });
  return jsonOk({ items });
}

/** Toggle save: body { internshipId, saved?: boolean } */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const internshipId = String(body.internshipId || '');
  if (!internshipId) return jsonError('internshipId is required');

  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonError('Candidate profile missing', 404);

  const exists = await query(`SELECT id FROM ip_internships WHERE id = $1`, [internshipId]);
  if (!exists.rows[0]) return jsonError('Internship not found', 404);

  const current = await query(
    `SELECT id FROM ip_saved_internships WHERE candidate_id = $1 AND internship_id = $2`,
    [cand.rows[0].id, internshipId],
  );

  const wantSaved = body.saved === undefined ? !current.rows[0] : Boolean(body.saved);

  if (wantSaved && !current.rows[0]) {
    await query(
      `INSERT INTO ip_saved_internships (id, candidate_id, internship_id) VALUES ($1,$2,$3)`,
      [newId('ip_save'), cand.rows[0].id, internshipId],
    );
  } else if (!wantSaved && current.rows[0]) {
    await query(`DELETE FROM ip_saved_internships WHERE id = $1`, [current.rows[0].id]);
  }

  return jsonOk({ ok: true, saved: wantSaved });
}
