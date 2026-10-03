import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { parseInterviewMeetUrl } from '@/lib/ipInterviewMeetUrl';
import { employerCanSetStatus, employerStatusBlockedMessage } from '@/lib/ipApplicationPresentation';
import { applyEmployerApplicationStatus } from '@/lib/ipApplicationStatusChange';

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
    `SELECT a.id, a.status, a.internship_id, i.employer_id, i.title, i.show_employer_identity,
            c.user_id as candidate_user_id, e.company_name
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE a.id = $1`,
    [id],
  );
  const row = app.rows[0];
  if (!row || row.employer_id !== emp.rows[0]?.id) return jsonError('Not found', 404);

  const currentStatus = String(row.status || 'applied').toLowerCase();
  if (!employerCanSetStatus(currentStatus, status)) {
    return jsonError(employerStatusBlockedMessage(currentStatus, status), 409);
  }
  if (currentStatus === 'hired' && status !== 'hired') {
    const accepted = await query(
      `SELECT 1 FROM ip_offers WHERE application_id = $1 AND status = 'accepted' LIMIT 1`,
      [id],
    );
    if (accepted.rows[0]) {
      return jsonError('The candidate accepted your offer, so this hire can no longer be changed here.', 409);
    }
  }

  const { threadId } = await applyEmployerApplicationStatus({
    row,
    employerUserId: session.user.id,
    status,
    interviewAt: status === 'interviewing' ? interviewAt : null,
    interviewMeetUrl: status === 'interviewing' ? interviewMeetUrl : null,
  });
  return jsonOk({
    ok: true,
    interviewAt: status === 'interviewing' ? interviewAt : null,
    interviewMeetUrl: status === 'interviewing' ? interviewMeetUrl : null,
    threadId: threadId || null,
  });
}
