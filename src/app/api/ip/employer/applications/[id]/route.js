import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { parseInterviewMeetUrl } from '@/lib/ipInterviewMeetUrl';
import { newId } from '@/lib/ids';
import { linkThreadToApplicationIfPresent } from '@/lib/ipLinkThreadApplication';
import { ensureIpMessageInboxSchema } from '@/lib/ipMessageThreadQuery';

/** Same closed set as ip_applications_status_check (all writers, not only this PATCH). */
const ALLOWED = [
  'applied',
  'shortlisted',
  'interviewing',
  'rejected',
  'hired',
  'offered',
  'completed',
  'declined_offer',
  'withdrawn',
];

export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpApplicationInterviewSchema();
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const status = String(body.status || '');
  if (!ALLOWED.includes(status)) return jsonError(`status must be one of ${ALLOWED.join(', ')}`);

  let interviewAt = null;
  if (body.interviewAt != null && String(body.interviewAt).trim()) {
    const d = new Date(body.interviewAt);
    if (Number.isNaN(d.getTime())) return jsonError('interviewAt must be a valid date/time');
    interviewAt = d.toISOString();
  }
  if (status === 'interviewing' && !interviewAt) {
    return jsonError('interviewAt is required when status is interviewing');
  }

  let interviewMeetUrl = null;
  if (status === 'interviewing') {
    const parsedMeet = parseInterviewMeetUrl(body.interviewMeetUrl ?? body.interview_meet_url);
    if (!parsedMeet.ok) return jsonError(parsedMeet.error);
    interviewMeetUrl = parsedMeet.url;
  }

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const app = await query(
    `SELECT a.id, a.internship_id, i.employer_id, i.title, c.user_id as candidate_user_id, e.company_name
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.id = $1`,
    [id],
  );
  const row = app.rows[0];
  if (!row || row.employer_id !== emp.rows[0]?.id) return jsonError('Not found', 404);

  if (status === 'interviewing') {
    await query(
      `UPDATE ip_applications
       SET status = $2, interview_at = $3, interview_meet_url = $4, updated_at = now()
       WHERE id = $1`,
      [id, status, interviewAt, interviewMeetUrl],
    );
  } else {
    await query(
      `UPDATE ip_applications
       SET status = $2, interview_at = NULL, interview_meet_url = NULL, updated_at = now()
       WHERE id = $1`,
      [id, status],
    );
  }

  let threadId = null;
  if (status === 'interviewing') {
    await ensureIpMessageInboxSchema();
    const existing = await query(
      `SELECT id FROM ip_message_threads
       WHERE candidate_user_id = $1 AND employer_user_id = $2 AND internship_id = $3
       LIMIT 1`,
      [row.candidate_user_id, session.user.id, row.internship_id],
    );
    threadId = existing.rows[0]?.id || null;
    if (!threadId) {
      threadId = newId('ip_thread');
      await query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject, application_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [threadId, row.internship_id, row.candidate_user_id, session.user.id, row.title || 'Interview', row.id],
      );
    }
    await linkThreadToApplicationIfPresent(query, {
      threadId,
      internshipId: row.internship_id,
      candidateUserId: row.candidate_user_id,
      applicationId: row.id,
    });
    const whenLabel = new Date(interviewAt).toLocaleString();
    const meetLine = interviewMeetUrl ? `\nJoin meeting: ${interviewMeetUrl}` : '';
    const scheduleBody = `Interview scheduled for ${whenLabel}.${meetLine}`;
    await query(
      `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
      [newId('ip_msg'), threadId, session.user.id, scheduleBody],
    );
    await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  }

  const notifyBody =
    status === 'interviewing' && interviewAt
      ? `${row.title} — interview ${new Date(interviewAt).toLocaleString()}${
          interviewMeetUrl ? ` · ${interviewMeetUrl}` : ''
        }`
      : row.title;
  await notifyUser({
    userId: row.candidate_user_id,
    title: status === 'interviewing' ? 'Interview invitation received' : `Application ${status}`,
    body: notifyBody,
    link:
      status === 'interviewing' && threadId
        ? `/candidate/messages/${encodeURIComponent(threadId)}`
        : status === 'interviewing'
          ? '/candidate/messages'
          : `/candidate/applications?id=${encodeURIComponent(row.id)}`,
    category: status === 'interviewing' ? 'interview' : 'application',
    meta: {
      applicationId: row.id,
      company: row.company_name || null,
      interviewAt: status === 'interviewing' ? interviewAt : null,
      interviewMeetUrl: status === 'interviewing' ? interviewMeetUrl : null,
      internshipTitle: row.title,
      threadId: threadId || null,
    },
  });
  await query(
    `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [
      newId('ip_aev'),
      id,
      session.user.id,
      status,
      JSON.stringify({ interviewAt, interviewMeetUrl, threadId }),
    ],
  );
  return jsonOk({
    ok: true,
    interviewAt: status === 'interviewing' ? interviewAt : null,
    interviewMeetUrl: status === 'interviewing' ? interviewMeetUrl : null,
    threadId: threadId || null,
  });
}
