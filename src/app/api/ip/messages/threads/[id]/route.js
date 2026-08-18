import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { notifyUser } from '@/lib/ipNotify';
import { decorateMessageThread, isAllowedMessageAttachmentUrl, lastMessagePreview } from '@/lib/ipMessagePresentation';
import { loadMessageThread } from '@/lib/ipMessageThreadQuery';

async function loadThread(id, uid) {
  return loadMessageThread(id, uid);
}

function archivedForUser(thread, session) {
  if (!thread) return false;
  if (session.user.id === thread.employer_user_id) return Boolean(thread.employer_archived_at);
  if (session.user.id === thread.candidate_user_id) return Boolean(thread.candidate_archived_at);
  return false;
}

function archiveColumnForUser(thread, uid) {
  if (uid === thread.employer_user_id) return 'employer_archived_at';
  if (uid === thread.candidate_user_id) return 'candidate_archived_at';
  return null;
}

function threadOut(thread, session) {
  const decorated = decorateMessageThread({
    ...thread,
    archived: archivedForUser(thread, session),
  });
  if (session.user.role !== 'employer') {
    delete decorated.candidate_resume_url;
  }
  return decorated;
}

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  const { id } = await params;
  const thread = await loadThread(id, session.user.id);
  if (!thread) return jsonError('Thread not found', 404);

  await query(
    `UPDATE ip_messages SET read_at = now() WHERE thread_id = $1 AND sender_user_id != $2 AND read_at IS NULL`,
    [id, session.user.id],
  );

  const messages = await query(
    `SELECT m.*, u.name as sender_name, u.role as sender_role FROM ip_messages m JOIN ip_users u ON u.id = m.sender_user_id
     WHERE thread_id = $1 ORDER BY sent_at ASC`,
    [id],
  );
  return jsonOk({
    thread: threadOut(thread, session),
    messages: messages.rows,
  });
}

export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  const { id } = await params;
  const thread = await loadThread(id, session.user.id);
  if (!thread) return jsonError('Thread not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  if (typeof body.archived !== 'boolean') {
    return jsonError('archived boolean is required');
  }

  const archiveCol = archiveColumnForUser(thread, session.user.id);
  if (!archiveCol) return jsonError('Forbidden', 403);

  await query(
    `UPDATE ip_message_threads SET ${archiveCol} = ${body.archived ? 'now()' : 'NULL'}, updated_at = now() WHERE id = $1`,
    [id],
  );

  const updated = await loadThread(id, session.user.id);
  return jsonOk({ ok: true, thread: threadOut(updated, session) });
}

export async function POST(request, { params }) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  const { id } = await params;
  const thread = await loadThread(id, session.user.id);
  if (!thread) return jsonError('Thread not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const text = String(body.message || '').trim();
  const attachment = body.attachment && typeof body.attachment === 'object' ? body.attachment : null;
  const attachmentUrl = attachment ? String(attachment.url || attachment.fileUrl || '').trim() : '';
  const attachmentName = attachment ? String(attachment.name || attachment.fileName || '').trim().slice(0, 180) : '';
  const attachmentSize = attachment ? Number(attachment.size || attachment.fileSize || 0) : 0;
  const attachmentType = attachment ? String(attachment.type || attachment.contentType || '').trim().slice(0, 120) : '';

  if (attachmentUrl && !isAllowedMessageAttachmentUrl(attachmentUrl)) {
    return jsonError('Invalid attachment');
  }
  if (!text && !attachmentUrl) return jsonError('Message body or attachment is required');

  await query(
    `INSERT INTO ip_messages (id, thread_id, sender_user_id, body, attachment_url, attachment_name, attachment_size, attachment_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      newId('ip_msg'),
      id,
      session.user.id,
      text,
      attachmentUrl || null,
      attachmentUrl ? attachmentName || 'attachment' : null,
      attachmentUrl && Number.isFinite(attachmentSize) && attachmentSize > 0 ? Math.trunc(attachmentSize) : null,
      attachmentUrl ? attachmentType || null : null,
    ],
  );
  await query(`UPDATE ip_message_threads SET updated_at = now() WHERE id = $1`, [id]);

  const otherUserId = session.user.id === thread.candidate_user_id ? thread.employer_user_id : thread.candidate_user_id;
  const otherLink =
    otherUserId === thread.candidate_user_id
      ? `/candidate/messages/${id}`
      : `/employer/messages/${id}`;
  const notifyText = lastMessagePreview(text, attachmentName) || 'New message';
  const isCandidateRecipient = otherUserId === thread.candidate_user_id;
  await notifyUser({
    userId: otherUserId,
    title: isCandidateRecipient ? 'New message from recruiter' : 'New message',
    body: notifyText.slice(0, 120),
    link: otherLink,
    category: isCandidateRecipient ? 'message' : 'system',
    meta: {
      threadId: id,
      company: isCandidateRecipient ? thread.company_name || null : null,
    },
  });

  return jsonOk({ ok: true });
}
