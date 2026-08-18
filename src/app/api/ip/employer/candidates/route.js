import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';
import { skillMatchPercent } from '@/lib/skillMatch';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

/** Search searchable candidate profiles. Hides phone/email/CV per privacy rule. */
export async function GET(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const skill = (searchParams.get('skill') || '').trim().toLowerCase();
  const internshipId = (searchParams.get('internshipId') || '').trim();

  const where = ['c.searchable = true'];
  const params = [];
  if (q) {
    params.push(`%${q}%`);
    const i = params.length;
    where.push(
      `(lower(c.name) LIKE $${i} OR lower(c.college) LIKE $${i} OR lower(c.degree) LIKE $${i} OR lower(c.city) LIKE $${i} OR EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) LIKE $${i}))`
    );
  }
  if (skill && skill !== 'all') {
    params.push(skill);
    where.push(`EXISTS (SELECT 1 FROM unnest(c.skills) s WHERE lower(s) = $${params.length})`);
  }

  let eligibility = null;
  if (internshipId) {
    const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
    if (emp.rows[0]) {
      const posting = await query(
        `SELECT eligibility FROM ip_internships WHERE id = $1 AND employer_id = $2`,
        [internshipId, emp.rows[0].id]
      );
      if (posting.rows[0]) {
        eligibility = posting.rows[0].eligibility;
        if (typeof eligibility === 'string') {
          try {
            eligibility = JSON.parse(eligibility);
          } catch {
            eligibility = null;
          }
        }
      }
    }
  }

  const result = await query(
    `SELECT c.id, c.user_id, c.name, c.college, c.degree, c.specialization, c.city, c.state, c.skills,
            c.study_status, c.graduation_year, c.cgpa, c.availability_date, c.show_completed_internships,
            c.preferred_work_mode, c.ongoing_commitment, c.ongoing_commitment_note,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS profile_picture_url,
            c.has_wired_broadband, c.has_dedicated_laptop,
            c.preferred_hours_start, c.preferred_hours_end,
            c.immediate_start, c.willing_to_relocate, c.prior_experience
     FROM ip_candidates c WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 100`,
    params
  );

  const items = result.rows.map((row) => {
    const item = { ...row };
    if (internshipId && eligibility !== null) {
      item.match_score = skillMatchPercent(row.skills, eligibility);
    } else {
      item.match_score = null;
    }
    return item;
  });

  if (internshipId && eligibility !== null) {
    items.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  }

  return jsonOk({
    items,
    matchAgainst: internshipId || null,
    matchReady: Boolean(internshipId && eligibility !== null),
  });
}
