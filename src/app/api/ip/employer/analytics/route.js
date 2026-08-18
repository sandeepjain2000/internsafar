import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const empId = emp.rows[0]?.id;
  if (!empId) return jsonOk({ funnel: {}, stipend: {}, education: [] });

  const funnel = await query(
    `SELECT a.status, count(*) FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 GROUP BY a.status`,
    [empId],
  );
  const stipend = await query(
    `SELECT avg(stipend_inr)::int as avg_stipend, min(stipend_inr) as min_stipend, max(stipend_inr) as max_stipend
     FROM ip_internships WHERE employer_id = $1 AND stipend_inr IS NOT NULL`,
    [empId],
  );
  const education = await query(
    `SELECT c.college, c.degree, count(*) as candidates
     FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE i.employer_id = $1 GROUP BY c.college, c.degree ORDER BY candidates DESC LIMIT 10`,
    [empId],
  );
  const postings = await query(
    `SELECT count(*) as total, count(*) FILTER (WHERE status = 'published') as live FROM ip_internships WHERE employer_id = $1`,
    [empId],
  );

  const marketStipend = await query(`SELECT avg(stipend_inr)::int as market_avg FROM ip_internships WHERE stipend_inr IS NOT NULL`);
  const geography = await query(
    `SELECT COALESCE(c.city,'(unknown)') as city, COALESCE(c.state,'(unknown)') as state, count(*) as candidates
     FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE i.employer_id = $1 GROUP BY c.city, c.state ORDER BY candidates DESC LIMIT 10`,
    [empId],
  );
  const specialization = await query(
    `SELECT COALESCE(c.specialization,'(unspecified)') as specialization, count(*) as candidates
     FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE i.employer_id = $1 GROUP BY c.specialization ORDER BY candidates DESC LIMIT 10`,
    [empId],
  );
  const matchFit = await query(
    `SELECT round(avg(a.match_score)::numeric,1) as avg_match,
            count(*) FILTER (WHERE a.match_score >= 70) as strong_fit,
            count(*) as total
     FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1`,
    [empId],
  );

  return jsonOk({
    funnel: Object.fromEntries(funnel.rows.map((r) => [r.status, Number(r.count)])),
    stipend: stipend.rows[0],
    marketAvgStipend: marketStipend.rows[0]?.market_avg || null,
    education: education.rows,
    geography: geography.rows,
    specialization: specialization.rows,
    matchFit: matchFit.rows[0],
    postings: postings.rows[0],
  });
}
