/** Statuses that count as interview invitation, offer, or later pipeline. */
export const PHONE_REVEAL_STATUSES = new Set(['interviewing', 'offered', 'hired', 'completed']);

/** When hide_phone_until_shortlist is on, employers see mobile only after interview/offer. */
export function employerCanSeeCandidatePhone(applicationStatus, hidePhoneUntilShortlist) {
  if (!hidePhoneUntilShortlist) return true;
  return PHONE_REVEAL_STATUSES.has(String(applicationStatus || ''));
}
