/**
 * Optional application_id on message threads.
 * Invite-before-apply leaves it NULL. Applicant messaging can set it when a match exists.
 */
export async function linkThreadToApplicationIfPresent(query, { threadId, internshipId, candidateUserId, applicationId }) {
  if (!threadId) return;
  if (applicationId) {
    await query(
      `UPDATE ip_message_threads SET application_id = COALESCE(application_id, $2) WHERE id = $1`,
      [threadId, applicationId],
    );
    return;
  }
  if (!internshipId || !candidateUserId) return;
  const app = await query(
    `SELECT a.id FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     WHERE a.internship_id = $1 AND c.user_id = $2
     LIMIT 1`,
    [internshipId, candidateUserId],
  );
  if (!app.rows[0]) return;
  await query(
    `UPDATE ip_message_threads SET application_id = COALESCE(application_id, $2) WHERE id = $1`,
    [threadId, app.rows[0].id],
  );
}
