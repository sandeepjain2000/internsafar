import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';

/** Mark an application / internship engagement as completed (employer). Unlocks rate/endorse. */
export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const applicationId = String(body.applicationId || '');
  if (!applicationId) return jsonError('applicationId is required');

  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const app = await query(
    `SELECT a.*, i.employer_id, i.title, c.user_id as candidate_user_id, c.name as candidate_name, c.email as candidate_email
     FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE a.id = $1`,
    [applicationId],
  );
  const row = app.rows[0];
  if (!row || row.employer_id !== emp.rows[0]?.id) return jsonError('Not found', 404);

  await query(
    `UPDATE ip_applications
     SET status = 'completed', completed_at = now(), completion_notes = $2, updated_at = now()
     WHERE id = $1`,
    [applicationId, body.notes || null],
  );

  await notifyUser({
    userId: row.candidate_user_id,
    title: 'Internship marked complete',
    body: `${row.title} was marked completed. You can rate the employer and share your endorsement.`,
    link: '/candidate/offers',
    category: 'application',
  });

  try {
    await sendMail({
      to: row.candidate_email,
      subject: `Internship completed — ${row.title}`,
      html: `<p>Hi ${row.candidate_name},</p><p>Your internship <strong>${row.title}</strong> was marked complete. Sign in to rate the employer and view endorsements.</p>`,
      text: `Your internship ${row.title} was marked complete.`,
    });
  } catch (e) {
    console.warn('[completions] email', e.message);
  }

  return jsonOk({ ok: true });
}
