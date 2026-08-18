import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  const postings = await query(
    `SELECT i.id, i.title, i.status, i.stipend_inr, i.stipend_type, i.engagement_type, i.weekly_hours,
            i.work_hours_start, i.work_hours_end, i.created_at,
            (SELECT count(*) FROM ip_applications a WHERE a.internship_id = i.id) as applicants
     FROM ip_internships i WHERE i.employer_id = $1 ORDER BY i.created_at DESC`,
    [emp.rows[0].id],
  );
  const apps = await query(
    `SELECT a.id, a.status, a.match_score, a.created_at, i.title, c.name, c.college, c.degree, c.city
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE i.employer_id = $1 ORDER BY a.created_at DESC`,
    [emp.rows[0].id],
  );

  const lines = [];
  lines.push('Section,Postings');
  lines.push(['id', 'title', 'status', 'stipend_inr', 'stipend_type', 'engagement_type', 'weekly_hours', 'hours_start', 'hours_end', 'applicants', 'created_at'].join(','));
  for (const p of postings.rows) {
    lines.push([p.id, p.title, p.status, p.stipend_inr, p.stipend_type, p.engagement_type, p.weekly_hours, p.work_hours_start, p.work_hours_end, p.applicants, p.created_at].map(csvEscape).join(','));
  }
  lines.push('');
  lines.push('Section,Applications');
  lines.push(['id', 'title', 'candidate', 'college', 'degree', 'city', 'status', 'match_score', 'created_at'].join(','));
  for (const a of apps.rows) {
    lines.push([a.id, a.title, a.name, a.college, a.degree, a.city, a.status, a.match_score, a.created_at].map(csvEscape).join(','));
  }

  const body = lines.join('\n');
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="employer-export-${emp.rows[0].company_name || 'data'}.csv"`,
    },
  });
}
