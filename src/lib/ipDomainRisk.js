import { domainFromEmail, domainFromWebsite } from '@/lib/authRegisterRules';

const EDU_HINT = /\.(edu|ac\.[a-z]{2,}|edu\.[a-z]{2,})$/i;

export function isEduDomain(domainOrEmail) {
  const d = String(domainOrEmail || '').includes('@')
    ? domainFromEmail(domainOrEmail)
    : String(domainOrEmail || '').toLowerCase();
  return Boolean(d && EDU_HINT.test(d));
}

/** Client-side risk tag for employer contact email vs website. */
export function employerDomainRisk({ email, website }) {
  const mail = domainFromEmail(email);
  const web = domainFromWebsite(website);
  if (!mail) return { key: 'unknown', label: 'No email', tone: 'slate' };
  if (isEduDomain(mail) && web && mail !== web) {
    return { key: 'mismatch', label: 'Domain Mismatch', tone: 'amber' };
  }
  if (web && mail && web !== mail) {
    return { key: 'mismatch', label: 'Domain Mismatch', tone: 'amber' };
  }
  if (isEduDomain(mail)) {
    return { key: 'edu', label: 'Edu Account', tone: 'emerald' };
  }
  if (web && mail && web === mail) {
    return { key: 'verified', label: 'Verified Corporate', tone: 'emerald' };
  }
  return { key: 'ok', label: 'Review Domain', tone: 'slate' };
}

export function candidateDomainBadge(email) {
  if (isEduDomain(email)) return { key: 'edu', label: 'Edu Domain', tone: 'emerald' };
  if (domainFromEmail(email).endsWith('gmail.com') || domainFromEmail(email).endsWith('googlemail.com')) {
    return { key: 'gmail', label: 'Gmail Signup', tone: 'slate' };
  }
  return { key: 'other', label: 'Personal Domain', tone: 'amber' };
}

export const REJECT_PRESETS = [
  'Incomplete Document Upload',
  'Unverified Domain',
  'Incorrect Company Details',
  'Other',
];
