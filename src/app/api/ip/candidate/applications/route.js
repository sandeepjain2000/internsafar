import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { FIRST_APPLICATION_BONUS, POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { decorateCandidateApplication } from '@/lib/ipApplicationPresentation';
import { maybeAwardFirstApplicationBonus } from '@/lib/ipReferralCredit';

export async function GET() {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpApplicationInterviewSchema();
  const cand = await query(`SELECT id FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT a.*, i.title, i.stipend_inr, i.work_mode, i.location, i.status as internship_status,
            e.company_name, e.approval_status
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.candidate_id = $1
     ORDER BY a.created_at DESC`,
    [cand.rows[0].id],
  );
  return jsonOk({ items: result.rows.map(decorateCandidateApplication) });
}

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

  const cand = await query(`SELECT id, skills FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  if (!cand.rows[0]) return jsonError('Candidate profile missing', 404);

  const internship = await query(
    `SELECT id, employer_id, title, eligibility, questions FROM ip_internships WHERE id = $1 AND status = 'published'`,
    [internshipId],
  );
  if (!internship.rows[0]) return jsonError('Internship not found or not published', 404);

  const screening = Array.isArray(internship.rows[0].questions) ? internship.rows[0].questions : [];
  if (screening.length) {
    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const missing = screening.some((q, idx) => {
      const key = q?.id || `q${idx}`;
      return !String(answers[key] ?? '').trim();
    });
    if (missing) {
      return jsonError('Please answer all screening questions before applying.', 400);
    }
  }

  const dupe = await query(
    `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
    [internshipId, cand.rows[0].id],
  );
  if (dupe.rows[0]) return jsonError('You already applied to this internship', 409);

  /**
   * Candidate points = application currency only.
   * Each apply spends POINTS_PER_APPLICATION.
   */
  const userRow = await query(`SELECT points FROM ip_users WHERE id = $1`, [session.user.id]);
  const points = Number(userRow.rows[0]?.points || 0);
  if (points < POINTS_PER_APPLICATION) {
    return jsonError(
      `Need ${POINTS_PER_APPLICATION} points to apply (you have ${points}). Earn points via referrals and sharing.`,
      403,
    );
  }
  await query(
    `UPDATE ip_users SET points = points - $2, updated_at = now() WHERE id = $1`,
    [session.user.id, POINTS_PER_APPLICATION],
  );
  await query(
    `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
     VALUES ($1,$2,$3,'application_spend',$4::jsonb)`,
    [
      newId('ip_pts'),
      session.user.id,
      -POINTS_PER_APPLICATION,
      JSON.stringify({ internshipId, rate: POINTS_PER_APPLICATION }),
    ],
  );

  const skills = cand.rows[0].skills || [];
  const eligSkills = internship.rows[0].eligibility?.skills;
  let matchScore = 100;
  if (Array.isArray(eligSkills) && eligSkills.length) {
    const have = new Set(skills.map((s) => String(s).toLowerCase()));
    matchScore = Math.round(
      (eligSkills.filter((s) => have.has(String(s).toLowerCase())).length / eligSkills.length) * 100,
    );
  }

  const id = newId('ip_app');
  await query(
    `INSERT INTO ip_applications (id, internship_id, candidate_id, status, match_score, answers)
     VALUES ($1,$2,$3,'applied',$4,$5::jsonb)`,
    [id, internshipId, cand.rows[0].id, matchScore, JSON.stringify(body.answers || {})],
  );

  const appCount = await query(
    `SELECT count(*)::int AS n FROM ip_applications WHERE candidate_id = $1`,
    [cand.rows[0].id],
  );
  let firstApplicationBonus = 0;
  if (Number(appCount.rows[0]?.n || 0) === 1) {
    const bonus = await maybeAwardFirstApplicationBonus(session.user.id, id);
    if (bonus.awarded) firstApplicationBonus = FIRST_APPLICATION_BONUS;
  }

  const employer = await query(
    `SELECT e.user_id, u.email, e.company_name FROM ip_employers e JOIN ip_users u ON u.id = e.user_id WHERE e.id = $1`,
    [internship.rows[0].employer_id],
  );
  if (employer.rows[0]) {
    await notifyUser({
      userId: employer.rows[0].user_id,
      title: 'New applicant',
      body: `New application for ${internship.rows[0].title}`,
      link: `/employer/internships/${internshipId}`,
      category: 'application',
    });
    try {
      await sendMail({
        to: employer.rows[0].email,
        subject: `New applicant — ${internship.rows[0].title}`,
        html: `<p>You received a new application for <strong>${internship.rows[0].title}</strong>.</p><p>Sign in to review applicants.</p>`,
        text: `New application for ${internship.rows[0].title}.`,
      });
    } catch (e) {
      console.warn('[applications] employer email', e.message);
    }
  }

  await notifyUser({
    userId: session.user.id,
    title: 'Application submitted',
    body: `You applied to ${internship.rows[0].title}`,
    link: '/candidate/applications',
    category: 'application',
  });

  const bal = await query(`SELECT points FROM ip_users WHERE id = $1`, [session.user.id]);
  return jsonOk(
    {
      ok: true,
      id,
      matchScore,
      payment: { mode: 'points', cost: POINTS_PER_APPLICATION },
      firstApplicationBonus,
      pointsRemaining: Number(bal.rows[0]?.points || 0),
    },
    201,
  );
}
