/**
 * Centralized employer messaging semantics:
 * - Unread: candidate message with read_at IS NULL (inbound for employer)
 * - Responded: after the latest candidate message, there exists a later employer message
 * Reading must not mark responded; sending employer reply updates responded without clearing unrelated unread incorrectly.
 */

export function threadHasUnreadForEmployer(messages, employerUserId) {
  const list = Array.isArray(messages) ? messages : [];
  return list.some(
    (m) =>
      m.sender_user_id !== employerUserId &&
      !m.read_at,
  );
}

/**
 * Qualifying employer response = message from employer after the last candidate message.
 * If no candidate message ever, treat as responded only if employer has sent at least one message
 * (or unresponded if candidate never wrote — typically N/A; we treat "no candidate msg" as responded=true).
 */
export function threadIsRespondedByEmployer(messages, employerUserId) {
  const list = [...(Array.isArray(messages) ? messages : [])].sort(
    (a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0),
  );
  if (!list.length) return true;
  let lastCandidateIdx = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].sender_user_id !== employerUserId) {
      lastCandidateIdx = i;
      break;
    }
  }
  if (lastCandidateIdx < 0) return true; // only employer messages
  for (let i = lastCandidateIdx + 1; i < list.length; i += 1) {
    if (list[i].sender_user_id === employerUserId) return true;
  }
  return false;
}

/** SQL: applications with unread candidate→employer messages for this internship's threads */
export const UNREAD_FOR_EMPLOYER_EXISTS_SQL = `
  EXISTS (
    SELECT 1 FROM ip_message_threads t
    JOIN ip_messages m ON m.thread_id = t.id
    WHERE t.internship_id = a.internship_id
      AND t.candidate_user_id = c.user_id
      AND m.sender_user_id = t.candidate_user_id
      AND m.read_at IS NULL
  )
`;

/** SQL: unresponded = last candidate msg has no later employer msg */
export const UNRESPONDED_FOR_EMPLOYER_EXISTS_SQL = `
  EXISTS (
    SELECT 1 FROM ip_message_threads t
    WHERE t.internship_id = a.internship_id
      AND t.candidate_user_id = c.user_id
      AND EXISTS (
        SELECT 1 FROM ip_messages cm
        WHERE cm.thread_id = t.id AND cm.sender_user_id = t.candidate_user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM ip_messages cm
        JOIN LATERAL (
          SELECT max(cm2.sent_at) AS last_cand
          FROM ip_messages cm2
          WHERE cm2.thread_id = t.id AND cm2.sender_user_id = t.candidate_user_id
        ) lc ON true
        JOIN ip_messages em ON em.thread_id = t.id
          AND em.sender_user_id = t.employer_user_id
          AND em.sent_at > lc.last_cand
        WHERE cm.thread_id = t.id
      )
  )
`;

export function personalizeMessageBody(body, { candidateName, internshipTitle }) {
  const first = String(candidateName || 'there').trim().split(/\s+/)[0] || 'there';
  return String(body || '')
    .replace(/\{\{\s*candidate_first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*candidate_name\s*\}\}/gi, String(candidateName || first))
    .replace(/\{\{\s*internship_title\s*\}\}/gi, String(internshipTitle || ''));
}
