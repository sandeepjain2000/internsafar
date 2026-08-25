/**
 * Ratings and endorsements require a real application on that internship
 * between the employer and candidate. Status must be hired (offer accepted)
 * or completed (employer marked complete) — not merely applied.
 */
const ALLOWED = new Set(['hired', 'completed']);

export async function requireInternshipEngagement(query, { internshipId, candidateUserId, employerUserId, candidateId }) {
  if (!internshipId) {
    return { ok: false, error: 'internshipId is required — a rating or endorsement must name the internship.' };
  }

  const result = await query(
    `SELECT a.id, a.status, c.user_id AS candidate_user_id, e.user_id AS employer_user_id
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.internship_id = $1
       AND (
         ($2::text IS NOT NULL AND c.user_id = $2)
         OR ($3::text IS NOT NULL AND c.id = $3)
       )
       AND ($4::text IS NULL OR e.user_id = $4)
     LIMIT 1`,
    [internshipId, candidateUserId || null, candidateId || null, employerUserId || null],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      ok: false,
      error: 'No application connects this employer and candidate for that internship.',
    };
  }
  const status = String(row.status || '').toLowerCase();
  if (!ALLOWED.has(status)) {
    return {
      ok: false,
      error:
        'A rating or endorsement is only allowed after the candidate is hired or the internship is marked completed — not from an application alone.',
    };
  }
  return { ok: true, application: row };
}
