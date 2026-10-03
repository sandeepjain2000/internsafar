import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';
import { linkThreadToApplicationIfPresent } from '@/lib/ipLinkThreadApplication';
import { ensureIpMessageInboxSchema } from '@/lib/ipMessageThreadQuery';
import { closePendingOfferForApplication } from '@/lib/ipOfferLifecycle';
import { candidateFacingCompany } from '@/lib/ipEmployerIdentity';
import { formatIstDateTime } from '@/lib/ipIstTime';

/**
 * Write an employer status change for one application (single PATCH and bulk interview share this):
 * status + interview fields, pending-offer close, interview thread message, candidate notification,
 * application event. Caller has already checked ownership and the transition map.
 *
 * @param {object} p
 * @param {{ id: string, internship_id: string, title: string, candidate_user_id: string, company_name?: string, show_employer_identity?: boolean }} p.row
 * @param {string} p.employerUserId
 * @param {string} p.status
 * @param {string|null} [p.interviewAt] ISO string, required for interviewing
 * @param {string|null} [p.interviewMeetUrl]
 * @param {object} [p.eventExtra] merged into the event payload (e.g. { bulk: true })
 */
export async function applyEmployerApplicationStatus({
  row,
  employerUserId,
  status,
  interviewAt = null,
  interviewMeetUrl = null,
  eventExtra = {},
}) {
  const interviewing = status === 'interviewing';
  if (interviewing) {
    await query(
      `UPDATE ip_applications
       SET status = $2, interview_at = $3, interview_meet_url = $4, updated_at = now()
       WHERE id = $1`,
      [row.id, status, interviewAt, interviewMeetUrl],
    );
  } else {
    await query(
      `UPDATE ip_applications
       SET status = $2, interview_at = NULL, interview_meet_url = NULL, updated_at = now()
       WHERE id = $1`,
      [row.id, status],
    );
  }
  await closePendingOfferForApplication(row.id, status);

  let threadId = null;
  const whenLabel = interviewing && interviewAt ? formatIstDateTime(interviewAt) : '';
  if (interviewing) {
    await ensureIpMessageInboxSchema();
    const existing = await query(
      `SELECT id FROM ip_message_threads
       WHERE candidate_user_id = $1 AND employer_user_id = $2 AND internship_id = $3
       LIMIT 1`,
      [row.candidate_user_id, employerUserId, row.internship_id],
    );
    threadId = existing.rows[0]?.id || null;
    if (!threadId) {
      threadId = newId('ip_thread');
      await query(
        `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject, application_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [threadId, row.internship_id, row.candidate_user_id, employerUserId, row.title || 'Interview', row.id],
      );
    }
    await linkThreadToApplicationIfPresent(query, {
      threadId,
      internshipId: row.internship_id,
      candidateUserId: row.candidate_user_id,
      applicationId: row.id,
    });
    const meetLine = interviewMeetUrl ? `\nJoin meeting: ${interviewMeetUrl}` : '';
    await query(
      `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
      [newId('ip_msg'), threadId, employerUserId, `Interview scheduled for ${whenLabel}.${meetLine}`],
    );
    await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  }

  const notifyBody = interviewing && interviewAt
    ? `${row.title} — interview ${whenLabel}${interviewMeetUrl ? ` · ${interviewMeetUrl}` : ''}`
    : row.title;
  await notifyUser({
    userId: row.candidate_user_id,
    title: interviewing ? 'Interview invitation received' : `Application ${status}`,
    body: notifyBody,
    link:
      interviewing && threadId
        ? `/candidate/messages/${encodeURIComponent(threadId)}`
        : interviewing
          ? '/candidate/messages'
          : `/candidate/applications?id=${encodeURIComponent(row.id)}`,
    category: interviewing ? 'interview' : 'application',
    meta: {
      applicationId: row.id,
      company: candidateFacingCompany(row.company_name, row.show_employer_identity),
      interviewAt: interviewing ? interviewAt : null,
      interviewMeetUrl: interviewing ? interviewMeetUrl : null,
      internshipTitle: row.title,
      threadId: threadId || null,
    },
  });
  await query(
    `INSERT INTO ip_application_events (id, application_id, actor_user_id, event_type, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [
      newId('ip_aev'),
      row.id,
      employerUserId,
      status,
      JSON.stringify({ interviewAt, interviewMeetUrl, threadId, ...eventExtra }),
    ],
  );
  return { threadId };
}
