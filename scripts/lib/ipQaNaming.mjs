/**
 * Human-readable QA naming — never use random base36/hex blobs in emails, titles,
 * company names, or QA-inserted row ids that show up in Zoho/Gmail.
 *
 * Uniqueness: calendar run label like 20260827-151045 (readable) + short sequence.
 */
let seq = 0;

export function qaRunLabel(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** DB / fixture primary keys — readable, not base36. Example: ip_user_20260827-151045-003 */
export function qaDbId(prefix) {
  seq += 1;
  return `${prefix}_${qaRunLabel()}-${String(seq).padStart(3, '0')}`;
}

/** Referral codes for QA users — readable prefix + run. */
export function qaReferralCode(label = 'QA') {
  const base = String(label || 'QA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'QA';
  return `${base}${qaRunLabel().replace(/-/g, '').slice(-8)}`;
}

/** Stable +alias emails reused across runs (ensureUser upserts). */
export const QA_ALIAS = {
  loginDtPending: 'lawsonlclintern+qa-login-dt-pending@gmail.com',
  loginDtInactive: 'lawsonlclintern+qa-login-dt-inactive@gmail.com',
  loginDt2fa: 'lawsonlclintern+qa-login-dt-2fa@gmail.com',
  emailChangeFrom: 'lawsonlclintern+qa-email-change-from@gmail.com',
  emailChangeTo: 'lawsonlclintern+qa-email-change-to@gmail.com',
  offerAccept: 'lawsonlclintern+qa-offer-accept@gmail.com',
  offerDecline: 'lawsonlclintern+qa-offer-decline@gmail.com',
};

/** Titles / companies that appear in outbound mail — plain English only. */
export const QA_LABEL = {
  offerAcceptTarget: 'QA Offer Accept Target',
  offerDeclineTarget: 'QA Offer Decline Target',
  offerAcceptRole: 'QA Accept Offer',
  offerDeclineRole: 'QA Decline Offer',
  tabMarkerPrefix: 'QA Tab Marker',
};
