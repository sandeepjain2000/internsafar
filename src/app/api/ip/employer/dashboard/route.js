import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';

/** Employer home aggregates — recent apps + week delta (no new tables). */
export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;

  const emp = await query(
    `SELECT e.id, e.company_name, e.approval_status, u.points, u.name, u.email
     FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [session.user.id],
  );
  const employer = emp.rows[0];
  if (!employer) return jsonError('Employer profile not found', 404);

  const internships = await query(
    `SELECT i.id, i.title, i.status, i.work_mode, i.location, i.stipend_inr, i.stipend_type,
            i.created_at,
            (SELECT count(*)::int FROM ip_applications a WHERE a.internship_id = i.id) as applicant_count
     FROM ip_internships i
     WHERE i.employer_id = $1
     ORDER BY i.created_at DESC
     LIMIT 50`,
    [employer.id],
  );

  const recentApps = await query(
    `SELECT a.id, a.status, a.match_score, a.created_at, a.internship_id,
            i.title as internship_title,
            c.name as candidate_name, c.college, c.cgpa, c.resume_url
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE i.employer_id = $1
     ORDER BY a.created_at DESC
     LIMIT 8`,
    [employer.id],
  );

  const weekApps = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.created_at >= now() - interval '7 days'`,
    [employer.id],
  );

  const pendingReviews = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.status IN ('applied','under_review','pending')`,
    [employer.id],
  );

  const ratings = await query(
    `SELECT coalesce(avg(stars),0)::float AS avg_stars, count(*)::int AS n
     FROM ip_ratings WHERE to_user_id = $1`,
    [session.user.id],
  );

  const points = Number(employer.points || 0);
  const postingsLeft = Math.floor(points / POINTS_PER_POST);
  const published = internships.rows.filter((i) => i.status === 'published');
  const totalApplicants = internships.rows.reduce((s, i) => s + Number(i.applicant_count || 0), 0);

  return jsonOk({
    employer: {
      id: employer.id,
      companyName: employer.company_name,
      approvalStatus: employer.approval_status,
      points,
      name: employer.name,
      email: employer.email,
    },
    stats: {
      activePostings: published.length,
      totalApplicants,
      applicantsThisWeek: weekApps.rows[0]?.n || 0,
      pendingReviews: pendingReviews.rows[0]?.n || 0,
      points,
      postingsLeft,
      pointsPerPost: POINTS_PER_POST,
      avgRating: ratings.rows[0]?.avg_stars || 0,
      ratingCount: ratings.rows[0]?.n || 0,
    },
    postings: published.slice(0, 5),
    recentApplications: recentApps.rows,
  });
}
