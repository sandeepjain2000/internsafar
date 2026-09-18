import { query } from '@/lib/db';
import { loadMessageThread } from '@/lib/ipMessageThreadQuery';

/**
 * Whether the session may stream an S3 object via /api/ip/files.
 * Key shapes (from upload routes):
 *   internship-portal/candidates/{userId}/resume|photo/...
 *   internship-portal/employers/{userId}/documents|logo/...
 *   internship-portal/messages/{threadId}/...
 */
export async function canAccessIpObject(session, rawKey) {
  const key = String(rawKey || '');
  if (!key.startsWith('internship-portal/') || key.includes('..')) return false;

  const role = session?.user?.role;
  const uid = session?.user?.id;
  if (!uid || !role) return false;
  if (role === 'superadmin') return true;

  const parts = key.split('/').filter(Boolean);
  // ['internship-portal', kind, id, ...rest]
  if (parts.length < 3) return false;
  const [, kind, id] = parts;
  const sub = parts[3] || '';

  if (kind === 'candidates') {
    if (id === uid) return true;
    if (role !== 'employer') return false;
    // Employers with an application or message thread may open resume (and photo).
    return employerLinkedToCandidate(uid, id);
  }

  if (kind === 'employers') {
    if (id === uid) return true;
    // Logos appear on internship cards for any signed-in user.
    if (sub === 'logo') return true;
    // Verification documents: owner + superadmin only.
    return false;
  }

  if (kind === 'messages') {
    const thread = await loadMessageThread(id, uid);
    return Boolean(thread);
  }

  return false;
}

async function employerLinkedToCandidate(employerUserId, candidateUserId) {
  const result = await query(
    `SELECT 1
     FROM ip_applications a
     JOIN ip_candidates c ON c.id = a.candidate_id
     JOIN ip_internships i ON i.id = a.internship_id
     JOIN ip_employers e ON e.id = i.employer_id
     WHERE e.user_id = $1 AND c.user_id = $2
     LIMIT 1`,
    [employerUserId, candidateUserId],
  );
  if (result.rows[0]) return true;

  const thread = await query(
    `SELECT 1 FROM ip_message_threads
     WHERE employer_user_id = $1 AND candidate_user_id = $2
     LIMIT 1`,
    [employerUserId, candidateUserId],
  );
  return Boolean(thread.rows[0]);
}
