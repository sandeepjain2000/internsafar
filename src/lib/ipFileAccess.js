import { query } from '@/lib/db';
import { loadMessageThread } from '@/lib/ipMessageThreadQuery';

/**
 * Whether the session may stream an S3 object via /api/ip/files.
 * Key shapes (from upload routes):
 *   internship-portal/candidates/{userId}/resume|photo/...
 *   internship-portal/employers/{userId}/documents|logo|offer-letters/...
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
    // Employers may open resume/photo only via an owned application relationship.
    // A message thread alone is never enough (IP-SEC-003).
    return employerLinkedToCandidate(uid, id);
  }

  if (kind === 'employers') {
    if (id === uid) return true;
    // Logos appear on internship cards for any signed-in user.
    if (sub === 'logo') return true;
    // Offer letters: the candidate named on the offer that stores this file.
    if (sub === 'offer-letters' && role === 'candidate') {
      return candidateCanReadOfferLetter(uid, key);
    }
    // Verification documents: owner + superadmin only.
    return false;
  }

  if (kind === 'messages') {
    const thread = await loadMessageThread(id, uid);
    return Boolean(thread);
  }

  return false;
}

async function candidateCanReadOfferLetter(candidateUserId, key) {
  const encoded = encodeURIComponent(key);
  const result = await query(
    `SELECT 1
     FROM ip_offers o
     JOIN ip_candidates c ON c.id = o.candidate_id
     WHERE c.user_id = $1
       AND o.letter_url IS NOT NULL
       AND (position($2 in o.letter_url) > 0 OR position($3 in o.letter_url) > 0)
     LIMIT 1`,
    [candidateUserId, key, encoded],
  );
  return Boolean(result.rows[0]);
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
  return Boolean(result.rows[0]);
}
