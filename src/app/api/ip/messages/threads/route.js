import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { decorateMessageThread } from '@/lib/ipMessagePresentation';
import { maskEmployerName } from '@/lib/ipEmployerIdentity';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { linkThreadToApplicationIfPresent } from '@/lib/ipLinkThreadApplication';
import {
  ensureIpMessageInboxSchema,
  THREAD_JOINS,
  THREAD_LAST_MESSAGE_SQL,
  THREAD_SELECT_CORE,
} from '@/lib/ipMessageThreadQuery';

export async function GET(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpMessageInboxSchema();
  const uid = session.user.id;
  const role = session.user.role;
  const archivedOnly = new URL(request.url).searchParams.get('archived') === '1';
  const archiveCol = role === 'employer' ? 'employer_archived_at' : 'candidate_archived_at';

  const result = await query(
    `SELECT ${THREAD_SELECT_CORE},
            ${THREAD_LAST_MESSAGE_SQL} as last_message,
            (SELECT sent_at FROM ip_messages m WHERE m.thread_id = t.id ORDER BY sent_at DESC LIMIT 1) as last_message_at,
            (SELECT u.name FROM ip_messages m JOIN ip_users u ON u.id = m.sender_user_id
              WHERE m.thread_id = t.id ORDER BY sent_at DESC LIMIT 1) as last_sender_name,
            (SELECT m.sender_user_id FROM ip_messages m WHERE m.thread_id = t.id ORDER BY sent_at DESC LIMIT 1) as last_sender_user_id,
            (SELECT count(*) FROM ip_messages m WHERE m.thread_id = t.id) as message_count,
            (SELECT count(*) FROM ip_messages m WHERE m.thread_id = t.id AND m.sender_user_id != $1 AND m.read_at IS NULL) as unread_count,
            (t.${archiveCol} IS NOT NULL) as archived
     FROM ip_message_threads t
     ${THREAD_JOINS}
     WHERE (t.candidate_user_id = $1 OR t.employer_user_id = $1)
       AND (${archivedOnly ? `t.${archiveCol} IS NOT NULL` : `t.${archiveCol} IS NULL`})
     ORDER BY COALESCE(
       (SELECT sent_at FROM ip_messages m WHERE m.thread_id = t.id ORDER BY sent_at DESC LIMIT 1),
       t.updated_at
     ) DESC`,
    [uid],
  );
  const items = result.rows.map((row) => {
    const masked =
      role === 'candidate'
        ? {
            ...row,
            company_name: maskEmployerName(row.company_name, row.show_employer_identity !== false),
          }
        : row;
    const decorated = decorateMessageThread(masked);
    if (role !== 'employer') delete decorated.candidate_resume_url;
    return decorated;
  });
  return jsonOk({ items });
}

export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpMessageInboxSchema();
  await ensureIpWorkbenchSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const internshipId = body.internshipId || null;
  const otherUserId = String(body.otherUserId || '');
  const message = String(body.message || '').trim();
  if (!otherUserId) return jsonError('otherUserId is required');

  const isEmployer = session.user.role === 'employer';
  const employerUserId = isEmployer ? session.user.id : otherUserId;
  const candidateUserId = isEmployer ? otherUserId : session.user.id;

  const existing = await query(
    `SELECT id FROM ip_message_threads
     WHERE candidate_user_id = $1 AND employer_user_id = $2 AND (internship_id = $3 OR ($3 IS NULL AND internship_id IS NULL))`,
    [candidateUserId, employerUserId, internshipId],
  );
  let threadId = existing.rows[0]?.id;
  if (!threadId) {
    threadId = newId('ip_thread');
    let title = null;
    if (internshipId) {
      const int = await query(`SELECT title FROM ip_internships WHERE id = $1`, [internshipId]);
      title = int.rows[0]?.title || null;
    }
    await query(
      `INSERT INTO ip_message_threads (id, internship_id, candidate_user_id, employer_user_id, subject)
       VALUES ($1,$2,$3,$4,$5)`,
      [threadId, internshipId, candidateUserId, employerUserId, title],
    );
  }

  await linkThreadToApplicationIfPresent(query, {
    threadId,
    internshipId,
    candidateUserId,
  });

  if (message) {
    await query(
      `INSERT INTO ip_messages (id, thread_id, sender_user_id, body) VALUES ($1,$2,$3,$4)`,
      [newId('ip_msg'), threadId, session.user.id, message],
    );
    await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [threadId]);
  }

  return jsonOk({ ok: true, threadId }, 201);
}
