import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';

/** Employer invites a searchable candidate to apply to a specific internship. */
export async function POST(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const { id } = await params; // candidate id
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const internshipId = String(body.internshipId || '');
  if (!internshipId) return jsonError('internshipId is required');

  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const internship = await query(`SELECT id, title FROM ip_internships WHERE id = $1 AND employer_id = $2`, [internshipId, emp.rows[0]?.id]);
  if (!internship.rows[0]) return jsonError('Internship not found', 404);

  const candidate = await query(`SELECT user_id FROM ip_candidates WHERE id = $1 AND searchable = true`, [id]);
  if (!candidate.rows[0]) return jsonError('Candidate not found or not searchable', 404);

  await notifyUser({
    userId: candidate.rows[0].user_id,
    title: `${emp.rows[0].company_name} invited you to apply`,
    body: internship.rows[0].title,
    link: `/candidate/internships/${internshipId}`,
    category: 'application',
    meta: {
      company: emp.rows[0].company_name || null,
      internshipId,
      internshipTitle: internship.rows[0].title,
    },
  });

  const threadId = newId('ip_thread');
  const existing = await query(
    `SELECT id FROM ip_message_threads WHERE candidate_user_id = $1 AND employer_user_id = $2 AND internship_id = $3`,
    [candidate.rows[0].user_id, session.user.id, internshipId],
  );
  const tId = existing.rows[0]?.id || threadId;
  if (!existing.rows[0]) {
    await query(
      `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
       VALUES ($1,$2,$3,$4,$5)`,
      [tId, internshipId, candidate.rows[0].user_id, session.user.id, internship.rows[0].title],
    );
  }
  await query(
    `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
    [newId('ip_msg'), tId, session.user.id, `We'd love for you to apply to ${internship.rows[0].title}.`],
  );

  return jsonOk({ ok: true, threadId: tId });
}
