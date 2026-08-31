import { query } from '@/lib/db';
import { requireSession } from '@/lib/apiAuth';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { experienceExportText } from '@/lib/ipCandidateExperience';

function toCsv(rows) {
  if (!rows.length) return 'No data';
  const headers = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const cand = await query(`SELECT * FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const c = cand.rows[0];
  if (!c) {
    return new Response('No data', { headers: { 'Content-Type': 'text/csv' } });
  }

  const apps = await query(
    `SELECT i.title, e.company_name, a.status, a.match_score, a.created_at
     FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.candidate_id = $1 ORDER BY a.created_at DESC`,
    [c.id],
  );
  const offers = await query(
    `SELECT o.role_title, o.status, o.stipend_inr, o.start_date, i.title, e.company_name
     FROM ip_offers o JOIN ip_internships i ON i.id = o.internship_id JOIN ip_employers e ON e.id = o.employer_id
     WHERE o.candidate_id = $1 ORDER BY o.created_at DESC`,
    [c.id],
  );
  const profileRows = [{
    name: c.name, email: c.email, phone: c.phone, city: c.city, state: c.state,
    college: c.college, degree: c.degree, specialization: c.specialization,
    preferred_hours: `${c.preferred_hours_start || ''}–${c.preferred_hours_end || ''}`,
    has_wired_broadband: c.has_wired_broadband, has_dedicated_laptop: c.has_dedicated_laptop,
    prior_experience: experienceExportText(c.prior_experience),
    immediate_start: c.immediate_start,
    willing_to_relocate: c.willing_to_relocate,
    hide_phone_until_shortlist: c.hide_phone_until_shortlist,
  }];

  const csv = [
    'PROFILE',
    toCsv(profileRows),
    '',
    'APPLICATIONS',
    toCsv(apps.rows),
    '',
    'OFFERS',
    toCsv(offers.rows),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="candidate-portal-export.csv"',
    },
  });
}
