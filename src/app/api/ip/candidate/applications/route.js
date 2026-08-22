import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { FIRST_APPLICATION_BONUS, POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { decorateCandidateApplication } from '@/lib/ipApplicationPresentation';
import { maybeAwardFirstApplicationBonus } from '@/lib/ipReferralCredit';
import { isCandidateAccessible } from '@/lib/ipInternshipVisibility';
import {
  validateScreeningAnswers,
  evaluateScreeningDisable,
  snapshotQuestions,
  normalizeAnswersForStorage,
  normalizeScreeningQuestions,
} from '@/lib/ipScreeningQuestions';
import { withApplicationCapacityLock } from '@/lib/ipApplicationCapacity';
import { maskEmployerName } from '@/lib/ipEmployerIdentity';

export const dynamic = 'force-dynamic';

async function resolveCandidateId(session) {
  const uid = session.user.id;
  const email = String(session.user.email || '').trim();
  const byUser = await query(`SELECT id FROM ip_candidates WHERE user_id = $1 LIMIT 1`, [uid]);
  if (byUser.rows[0]?.id) return byUser.rows[0].id;
  if (email) {
    const byEmail = await query(
      `SELECT c.id FROM ip_candidates c
       JOIN ip_users u ON u.id = c.user_id
       WHERE lower(u.email) = lower($1) OR lower(c.email) = lower($1)
       LIMIT 1`,
      [email],
    );
    if (byEmail.rows[0]?.id) return byEmail.rows[0].id;
  }
  return null;
}

export async function GET(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  try {
    const candidateId = await resolveCandidateId(session);
    if (!candidateId) return jsonOk({ items: [], total: 0, page: 1, pageSize: 20 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const sort = searchParams.get('sort') || 'latest';
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') || 50)));

    const params = [candidateId];
    const where = ['a.candidate_id = $1'];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(lower(coalesce(i.title,'')) LIKE $${params.length} OR lower(coalesce(e.company_name,'')) LIKE $${params.length})`);
    }

    let orderBy = 'a.created_at DESC NULLS LAST';
    if (sort === 'oldest') orderBy = 'a.created_at ASC NULLS LAST';
    else if (sort === 'status') orderBy = 'a.status ASC, a.created_at DESC';
    else if (sort === 'match') orderBy = 'a.match_score DESC NULLS LAST';

    const countRes = await query(
      `SELECT count(*)::int AS n
       FROM ip_applications a
       LEFT JOIN ip_internships i ON i.id = a.internship_id
       LEFT JOIN ip_employers e ON e.id = i.employer_id
       WHERE ${where.join(' AND ')}`,
      params,
    );
    const total = Number(countRes.rows[0]?.n || 0);
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);

    const result = await query(
      `SELECT a.id, a.internship_id, a.candidate_id, a.status, a.match_score, a.created_at, a.updated_at,
              i.title, i.stipend_inr, i.work_mode, i.location, i.show_employer_identity,
              e.company_name, e.approval_status
       FROM ip_applications a
       LEFT JOIN ip_internships i ON i.id = a.internship_id
       LEFT JOIN ip_employers e ON e.id = i.employer_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const items = result.rows.map((row) =>
      decorateCandidateApplication({
        ...row,
        company_name: maskEmployerName(row.company_name, row.show_employer_identity !== false),
      }),
    );

    return jsonOk({ items, total, page, pageSize });
  } catch (e) {
    console.error('[ip/candidate/applications GET]', e);
    return jsonError(e.message || 'Failed to load applications', 500);
  }
}

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpWorkbenchSchema();

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
    `SELECT id, employer_id, title, eligibility, questions, status, starts_at, apply_ends_at
     FROM ip_internships WHERE id = $1`,
    [internshipId],
  );
  if (!internship.rows[0] || !isCandidateAccessible(internship.rows[0])) {
    return jsonError('Internship not found or not open for applications', 404);
  }

  const screening = normalizeScreeningQuestions(
    Array.isArray(internship.rows[0].questions) ? internship.rows[0].questions : [],
  );
  // Also accept legacy text questions that weren't re-normalized
  const liveQuestions = Array.isArray(internship.rows[0].questions) && internship.rows[0].questions.length
    ? (screening.length ? screening : internship.rows[0].questions)
    : [];

  const answersNorm = normalizeAnswersForStorage(liveQuestions, body.answers);
  if (liveQuestions.length) {
    const check = validateScreeningAnswers(liveQuestions, answersNorm);
    if (!check.ok) {
      return jsonError('Please answer all required screening questions before applying.', 400);
    }
  }

  const disableEval = evaluateScreeningDisable(liveQuestions, answersNorm);
  const qSnapshot = snapshotQuestions(liveQuestions);

  const dupe = await query(
    `SELECT id FROM ip_applications WHERE internship_id = $1 AND candidate_id = $2`,
    [internshipId, cand.rows[0].id],
  );
  if (dupe.rows[0]) return jsonError('You already applied to this internship', 409);

  const userRow = await query(`SELECT points FROM ip_users WHERE id = $1`, [session.user.id]);
  const points = Number(userRow.rows[0]?.points || 0);
  if (points < POINTS_PER_APPLICATION) {
    return jsonError(
      `Need ${POINTS_PER_APPLICATION} points to apply (you have ${points}). Earn points via referrals and sharing.`,
      403,
    );
  }

  const skills = cand.rows[0].skills || [];
  const eligSkills = internship.rows[0].eligibility?.skills;
  let matchScore = 100;
  if (Array.isArray(eligSkills) && eligSkills.length) {
    const have = new Set(skills.map((s) => String(s).toLowerCase()));
    matchScore = Math.round(
      (eligSkills.filter((s) => have.has(String(s).toLowerCase())).length / eligSkills.length) * 100,
    );
  }

  let id;
  try {
    id = await withApplicationCapacityLock(internshipId, async (client) => {
      await client.query(
        `UPDATE ip_users SET points = points - $2, updated_at = now() WHERE id = $1`,
        [session.user.id, POINTS_PER_APPLICATION],
      );
      await client.query(
        `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta)
         VALUES ($1,$2,$3,'application_spend',$4::jsonb)`,
        [
          newId('ip_pts'),
          session.user.id,
          -POINTS_PER_APPLICATION,
          JSON.stringify({ internshipId, rate: POINTS_PER_APPLICATION }),
        ],
      );
      const appId = newId('ip_app');
      await client.query(
        `INSERT INTO ip_applications (
           id, internship_id, candidate_id, status, match_score, answers,
           questions_snapshot, screening_disabled, screening_disable_reason
         ) VALUES ($1,$2,$3,'applied',$4,$5::jsonb,$6::jsonb,$7,$8::jsonb)`,
        [
          appId,
          internshipId,
          cand.rows[0].id,
          matchScore,
          JSON.stringify(answersNorm),
          JSON.stringify(qSnapshot),
          disableEval.disabled,
          disableEval.reason ? JSON.stringify(disableEval.reason) : null,
        ],
      );
      await client.query(
        `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
         VALUES ($1,$2,$3,'applied',$4::jsonb)`,
        [
          newId('ip_aev'),
          appId,
          session.user.id,
          JSON.stringify({
            screening_disabled: disableEval.disabled,
            reason: disableEval.reason,
          }),
        ],
      );
      return appId;
    });
  } catch (e) {
    if (e.code === 'CAPACITY') return jsonError(e.message, 409);
    throw e;
  }

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
      screeningDisabled: disableEval.disabled,
      payment: { mode: 'points', cost: POINTS_PER_APPLICATION },
      firstApplicationBonus,
      pointsRemaining: Number(bal.rows[0]?.points || 0),
    },
    201,
  );
}
