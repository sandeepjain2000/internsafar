import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { parseInterviewMeetUrl } from '@/lib/ipInterviewMeetUrl';
import { newId } from '@/lib/ids';

const ALLOWED = ['shortlisted', 'interviewing', 'rejected', 'hired', 'applied'];

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
    `SELECT a.id, i.employer_id, i.title, c.user_id as candidate_user_id, e.company_name
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

  const notifyBody =
    status === 'interviewing' && interviewAt
      ? `${row.title} — interview ${new Date(interviewAt).toLocaleString()}`
      : row.title;
  await notifyUser({
    userId: row.candidate_user_id,
    title: status === 'interviewing' ? 'Interview invitation received' : `Application ${status}`,
    body: notifyBody,
    link: status === 'interviewing' ? '/candidate/messages' : '/candidate/applications',
    category: status === 'interviewing' ? 'interview' : 'application',
    meta: {
      applicationId: row.id,
      company: row.company_name || null,
      interviewAt: status === 'interviewing' ? interviewAt : null,
      internshipTitle: row.title,
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
      JSON.stringify({ interviewAt, interviewMeetUrl }),
    ],
  );
  return jsonOk({
    ok: true,
    interviewAt: status === 'interviewing' ? interviewAt : null,
    interviewMeetUrl: status === 'interviewing' ? interviewMeetUrl : null,
  });
}
