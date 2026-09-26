import { query } from '@/lib/db';
import { requireSession, jsonError } from '@/lib/apiAuth';
import { workbookToBuffer } from '@/lib/ipXlsxWorkbook';

function safeFilePart(name) {
  return String(name || 'data')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'data';
}

function withHeaders(headers, rows) {
  if (rows.length) return rows;
  return [{ ...headers }];
}

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  const [postings, apps] = await Promise.all([
    query(
      `SELECT i.id, i.title, i.status, i.stipend_inr, i.stipend_type, i.engagement_type, i.weekly_hours,
              i.work_hours_start, i.work_hours_end, i.created_at,
              (SELECT count(*) FROM ip_applications a WHERE a.internship_id = i.id) as applicants
       FROM ip_internships i WHERE i.employer_id = $1 ORDER BY i.created_at DESC`,
      [emp.rows[0].id],
    ),
    query(
      `SELECT a.id, a.status, a.match_score, a.created_at, i.title, c.name, c.college, c.degree, c.city
       FROM ip_applications a
       JOIN ip_internships i ON i.id = a.internship_id
       JOIN ip_candidates c ON c.id = a.candidate_id
       WHERE i.employer_id = $1 ORDER BY a.created_at DESC`,
      [emp.rows[0].id],
    ),
  ]);

  const postingHeaders = {
    id: '',
    title: '',
    status: '',
    stipend_inr: '',
    stipend_type: '',
    engagement_type: '',
    weekly_hours: '',
    hours_start: '',
    hours_end: '',
    applicants: '',
    created_at: '',
  };
  const applicationHeaders = {
    id: '',
    title: '',
    candidate: '',
    college: '',
    degree: '',
    city: '',
    status: '',
    match_score: '',
    created_at: '',
  };

  const postingRows = postings.rows.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    stipend_inr: p.stipend_inr,
    stipend_type: p.stipend_type,
    engagement_type: p.engagement_type,
    weekly_hours: p.weekly_hours,
    hours_start: p.work_hours_start,
    hours_end: p.work_hours_end,
    applicants: p.applicants,
    created_at: p.created_at,
  }));
  const applicationRows = apps.rows.map((a) => ({
    id: a.id,
    title: a.title,
    candidate: a.name,
    college: a.college,
    degree: a.degree,
    city: a.city,
    status: a.status,
    match_score: a.match_score,
    created_at: a.created_at,
  }));

  const buffer = await workbookToBuffer([
    { name: 'Postings', rows: withHeaders(postingHeaders, postingRows) },
    { name: 'Applications', rows: withHeaders(applicationHeaders, applicationRows) },
  ]);

  const filename = `employer-export-${safeFilePart(emp.rows[0].company_name)}.xlsx`;
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
