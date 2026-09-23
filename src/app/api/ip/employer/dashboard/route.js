import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';
import { processAutoRejectExpiredApplications } from '@/lib/ipAutoRejectExpiredApplications';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';

/** Employer home aggregates — recent apps + week delta (no new tables). */
export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;

  await ensureIpApplicationInterviewSchema();

  const emp = await query(
    `SELECT e.id, e.company_name, e.approval_status, u.points, u.name, u.email,
            u.email_verified_at, u.email_verify_required, u.profile_complete
     FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
     WHERE e.user_id = $1`,
    [session.user.id],
  );
  const employer = emp.rows[0];
  if (!employer) return jsonError('Employer profile not found', 404);

  // Backup only: primary path is Vercel cron / npm run cron:auto-reject-expired
  // (employer login must not be required). Keep this small so dashboard stay snappy.
  // AWS (future): prefer EC2 crontab hitting /api/ip/cron/auto-reject-expired — see that route.
  try {
    await processAutoRejectExpiredApplications({ employerId: employer.id, limit: 25 });
  } catch (err) {
    console.warn('[employer dashboard auto-reject]', err.message);
  }

  const applicantTotals = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1`,
    [employer.id],
  );
  const liveCount = await query(
    `SELECT count(*)::int AS n FROM ip_internships WHERE employer_id = $1 AND status = 'published'`,
    [employer.id],
  );

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
     WHERE i.employer_id = $1 AND a.status IN ('applied','shortlisted')`,
    [employer.id],
  );

  /** Action Required: applications awaiting review for 3+ days */
  const stalePending = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1
       AND a.status IN ('applied','shortlisted')
       AND a.created_at <= now() - interval '3 days'`,
    [employer.id],
  );

  /** Upcoming: interviews scheduled for today (employer local calendar day via timestamptz) */
  const interviewsToday = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1
       AND a.interview_at IS NOT NULL
       AND a.interview_at::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`,
    [employer.id],
  );

  const ratings = await query(
    `SELECT coalesce(avg(stars),0)::float AS avg_stars, count(*)::int AS n
     FROM ip_ratings WHERE to_user_id = $1`,
    [session.user.id],
  );

  const docStats = await query(
    `SELECT
       count(*)::int AS uploaded,
       count(*) FILTER (WHERE lower(coalesce(review_status, 'pending')) = 'approved')::int AS approved,
       count(*) FILTER (WHERE lower(coalesce(review_status, 'pending')) = 'pending')::int AS pending
     FROM ip_employer_documents
     WHERE employer_id = $1`,
    [employer.id],
  );

  const points = Number(employer.points || 0);
  const postingsLeft = Math.floor(points / POINTS_PER_POST);
  const published = internships.rows.filter((i) => i.status === 'published');
  const totalApplicants = Number(applicantTotals.rows[0]?.n || 0);
  const activePostings = Number(liveCount.rows[0]?.n || published.length);

  const emailVerified =
    Boolean(employer.email_verified_at) || employer.email_verify_required === false;

  const documentsUploaded = Number(docStats.rows[0]?.uploaded || 0);
  const documentsApproved = Number(docStats.rows[0]?.approved || 0);
  const documentsPending = Number(docStats.rows[0]?.pending || 0);

  return jsonOk({
    employer: {
      id: employer.id,
      companyName: employer.company_name,
      approvalStatus: employer.approval_status,
      emailVerified,
      profileComplete: Boolean(employer.profile_complete),
      points,
      name: employer.name,
      email: employer.email,
    },
    stats: {
      activePostings,
      totalApplicants,
      applicantsThisWeek: weekApps.rows[0]?.n || 0,
      pendingReviews: pendingReviews.rows[0]?.n || 0,
      points,
      postingsLeft,
      pointsPerPost: POINTS_PER_POST,
      avgRating: ratings.rows[0]?.avg_stars || 0,
      ratingCount: ratings.rows[0]?.n || 0,
    },
    actionCenter: {
      pendingReviewStaleDays: Number(stalePending.rows[0]?.n || 0),
      interviewsToday: Number(interviewsToday.rows[0]?.n || 0),
      documentsUploaded,
      documentsApproved,
      documentsPending,
    },
    postings: published.slice(0, 5),
    recentApplications: recentApps.rows,
  });
}
