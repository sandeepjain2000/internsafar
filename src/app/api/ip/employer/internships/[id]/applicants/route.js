import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { employerCanSeeCandidatePhone } from '@/lib/ipCandidatePhonePrivacy';
import {
  internshipHistorySelectSql,
  decorateHistoryFields,
} from '@/lib/ipCandidateInternshipHistory';
import {
  UNREAD_FOR_EMPLOYER_EXISTS_SQL,
  UNRESPONDED_FOR_EMPLOYER_EXISTS_SQL,
} from '@/lib/ipMessageResponseState';
import { MAX_ACTIVE_APPLICATIONS_PER_POSTING } from '@/lib/ipApplicationCapacity';
import { summarizeMcqResponses } from '@/lib/ipMcqAnalytics';

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpApplicationInterviewSchema();
  await ensureIpCandidateProfileSchema();
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const owns = await query(`SELECT id, questions FROM ip_internships WHERE id = $1 AND employer_id = $2`, [id, emp.rows[0]?.id]);
  if (!owns.rows[0]) return jsonError('Not found', 404);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const minMatch = Number(searchParams.get('minMatch') || 0);
  const screeningDisabled = searchParams.get('screeningDisabled'); // 1|0|''
  const listId = searchParams.get('listId') || '';
  const messageSent = searchParams.get('messageSent'); // 1|0
  const unread = searchParams.get('unread') === '1';
  const responded = searchParams.get('responded'); // 1|0|''
  const lastContactedBefore = searchParams.get('lastContactedBefore') || '';
  const lastContactedAfter = searchParams.get('lastContactedAfter') || '';
  const mcqQuestionId = searchParams.get('mcqQuestionId') || '';
  const mcqAnswer = searchParams.get('mcqAnswer') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get('pageSize') || 20)));
  const city = (searchParams.get('city') || '').trim().toLowerCase();
  const minHistTotal = Number(searchParams.get('minHistTotal') || 0);
  const minHistCompleted = Number(searchParams.get('minHistCompleted') || 0);
  const minHistOngoing = Number(searchParams.get('minHistOngoing') || 0);
  const includeMcqSummary = searchParams.get('mcqSummary') === '1';
  const sort = searchParams.get('sort') || 'match';
  let orderBy = 'a.screening_disabled ASC, a.match_score DESC NULLS LAST, a.created_at ASC';
  if (sort === 'newest') orderBy = 'a.created_at DESC';
  if (sort === 'name') orderBy = 'lower(c.name) ASC';
  if (sort === 'status') orderBy = 'a.status ASC, a.match_score DESC NULLS LAST';

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
  if (screeningDisabled === '1') {
    where.push(`a.screening_disabled = true`);
  } else if (screeningDisabled === '0') {
    where.push(`a.screening_disabled = false`);
  }
  if (listId) {
    qParams.push(listId);
    where.push(`EXISTS (SELECT 1 FROM ip_employer_list_members lm WHERE lm.list_id = $${qParams.length} AND lm.application_id = a.id)`);
  }
  if (city) {
    qParams.push(`%${city}%`);
    where.push(`lower(c.city) LIKE $${qParams.length}`);
  }
  if (mcqQuestionId && mcqAnswer) {
    qParams.push(mcqQuestionId);
    qParams.push(mcqAnswer);
    where.push(`(a.answers ->> $${qParams.length - 1} = $${qParams.length} OR a.answers ->> $${qParams.length - 1} LIKE $${qParams.length})`);
  }
  if (minHistTotal > 0) {
    qParams.push(minHistTotal);
    where.push(`(SELECT count(*) FROM ip_applications ha WHERE ha.candidate_id = c.id) >= $${qParams.length}`);
  }
  if (minHistCompleted > 0) {
    qParams.push(minHistCompleted);
    where.push(`(
      CASE WHEN c.show_completed_internships IS FALSE THEN 0
      ELSE (SELECT count(*) FROM ip_applications ha
            WHERE ha.candidate_id = c.id AND (ha.completed_at IS NOT NULL OR ha.status = 'completed'))
      END
    ) >= $${qParams.length}`);
  }
  if (minHistOngoing > 0) {
    qParams.push(minHistOngoing);
    where.push(`(SELECT count(*) FROM ip_applications ha
      WHERE ha.candidate_id = c.id
        AND ha.status IN ('hired', 'accepted', 'offered', 'interviewing')
        AND ha.completed_at IS NULL) >= $${qParams.length}`);
  }
  if (messageSent === '1') {
    where.push(`EXISTS (
      SELECT 1 FROM ip_message_threads t
      WHERE t.internship_id = a.internship_id AND t.candidate_user_id = c.user_id
        AND EXISTS (SELECT 1 FROM ip_messages m WHERE m.thread_id = t.id AND m.sender_user_id = t.employer_user_id)
    )`);
  } else if (messageSent === '0') {
    where.push(`NOT EXISTS (
      SELECT 1 FROM ip_message_threads t
      WHERE t.internship_id = a.internship_id AND t.candidate_user_id = c.user_id
        AND EXISTS (SELECT 1 FROM ip_messages m WHERE m.thread_id = t.id AND m.sender_user_id = t.employer_user_id)
    )`);
  }
  if (unread) {
    where.push(UNREAD_FOR_EMPLOYER_EXISTS_SQL);
  }
  if (responded === '0') {
    where.push(UNRESPONDED_FOR_EMPLOYER_EXISTS_SQL);
  } else if (responded === '1') {
    where.push(`NOT (${UNRESPONDED_FOR_EMPLOYER_EXISTS_SQL})`);
  }
  if (lastContactedAfter) {
    qParams.push(lastContactedAfter);
    where.push(`EXISTS (
      SELECT 1 FROM ip_message_threads t JOIN ip_messages m ON m.thread_id = t.id
      WHERE t.internship_id = a.internship_id AND t.candidate_user_id = c.user_id
        AND m.sent_at >= $${qParams.length}::timestamptz
    )`);
  }
  if (lastContactedBefore) {
    qParams.push(lastContactedBefore);
    where.push(`EXISTS (
      SELECT 1 FROM ip_message_threads t JOIN ip_messages m ON m.thread_id = t.id
      WHERE t.internship_id = a.internship_id AND t.candidate_user_id = c.user_id
        AND m.sent_at <= $${qParams.length}::timestamptz
    )`);
  }

  const countRes = await query(
    `SELECT count(*)::int AS n
     FROM ip_applications a JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE ${where.join(' AND ')}`,
    qParams,
  );
  const total = Number(countRes.rows[0]?.n || 0);
  const offset = (page - 1) * pageSize;
  qParams.push(pageSize);
  qParams.push(offset);

  const result = await query(
    `SELECT a.*, c.name, c.email, c.college, c.degree, c.city, c.skills, c.resume_url, c.linkedin_url,
            c.user_id as candidate_user_id, c.phone, c.whatsapp_opt_in,
            CASE WHEN c.show_profile_picture THEN c.profile_picture_url ELSE NULL END AS profile_picture_url,
            c.preferred_hours_start, c.preferred_hours_end, c.has_wired_broadband, c.has_dedicated_laptop,
            c.ongoing_commitment, c.prior_experience, c.immediate_start, c.willing_to_relocate,
            c.hide_phone_until_shortlist,
            ${internshipHistorySelectSql('c')},
            (${UNREAD_FOR_EMPLOYER_EXISTS_SQL}) AS has_unread,
            (${UNRESPONDED_FOR_EMPLOYER_EXISTS_SQL}) AS is_unresponded,
            (SELECT string_agg(l.name, ', ') FROM ip_employer_list_members lm
              JOIN ip_employer_lists l ON l.id = lm.list_id WHERE lm.application_id = a.id) AS list_names
     FROM ip_applications a JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT $${qParams.length - 1} OFFSET $${qParams.length}`,
    qParams,
  );

  const caps = await query(
    `SELECT
       count(*)::int AS historical,
       count(*) FILTER (WHERE status NOT IN ('rejected', 'withdrawn'))::int AS active
     FROM ip_applications WHERE internship_id = $1`,
    [id],
  );

  const items = result.rows.map((row) => {
    const hide = row.hide_phone_until_shortlist !== false;
    const reveal = employerCanSeeCandidatePhone(row.status, hide);
    const hist = decorateHistoryFields(row);
    return {
      ...row,
      phone: reveal ? row.phone : null,
      phone_hidden: hide && !reveal,
      ...hist,
      communication: {
        unread: Boolean(row.has_unread),
        unresponded: Boolean(row.is_unresponded),
        responded: !row.is_unresponded,
      },
    };
  });

  let mcqSummary = null;
  if (includeMcqSummary) {
    const allApps = await query(
      `SELECT answers, questions_snapshot FROM ip_applications WHERE internship_id = $1`,
      [id],
    );
    mcqSummary = summarizeMcqResponses(owns.rows[0].questions || [], allApps.rows);
  }

  return jsonOk({
    items,
    total,
    page,
    pageSize,
    capacity: {
      active: caps.rows[0]?.active || 0,
      historical: caps.rows[0]?.historical || 0,
      max: MAX_ACTIVE_APPLICATIONS_PER_POSTING,
    },
    questions: owns.rows[0].questions || [],
    mcqSummary,
  });
}
