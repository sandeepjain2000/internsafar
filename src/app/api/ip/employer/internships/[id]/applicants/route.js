import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpApplicationInterviewSchema();
  await ensureIpCandidateProfileSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const owns = await query(`SELECT id FROM ip_internships WHERE id = $1 AND employer_id = $2`, [id, emp.rows[0]?.id]);
  if (!owns.rows[0]) return jsonError('Not found', 404);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const minMatch = Number(searchParams.get('minMatch') || 0);

  const qParams = [id];
  const where = ['a.internship_id = $1'];
  if (status) {
    qParams.push(status);
    where.push(`a.status = $${qParams.length}`);
  }
  if (q) {
    qParams.push(`%${q}%`);
    where.push(`(lower(c.name) LIKE $${qParams.length} OR lower(c.college) LIKE $${qParams.length} OR lower(c.degree) LIKE $${qParams.length})`);
  }
  if (minMatch) {
    qParams.push(minMatch);
    where.push(`COALESCE(a.match_score,0) >= $${qParams.length}`);
  }

  const result = await query(
    `SELECT a.*, c.name, c.email, c.college, c.degree, c.city, c.skills, c.resume_url, c.linkedin_url,
            c.user_id as candidate_user_id, c.phone, c.whatsapp_opt_in,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS profile_picture_url,
            c.preferred_hours_start, c.preferred_hours_end, c.has_wired_broadband, c.has_dedicated_laptop,
            c.ongoing_commitment, c.prior_experience, c.immediate_start, c.willing_to_relocate,
            c.hide_phone_until_shortlist
     FROM ip_applications a JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE ${where.join(' AND ')}
     ORDER BY a.match_score DESC NULLS LAST, a.created_at ASC`,
    qParams,
  );
  const items = result.rows.map((row) => {
    const hide = row.hide_phone_until_shortlist !== false;
    const reveal = employerCanSeeCandidatePhone(row.status, hide);
    return {
      ...row,
      phone: reveal ? row.phone : null,
      phone_hidden: hide && !reveal,
    };
  });
  return jsonOk({ items });
}
