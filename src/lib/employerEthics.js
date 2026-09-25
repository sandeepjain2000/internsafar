/** Employer Guidelines & Ethics — authoritative copy (DOCX §24). */
export const EMPLOYER_ETHICS_VERSION = '2026-08-08';

export const EMPLOYER_ETHICS_ITEMS = [
  {
    id: 'no_fees',
    label:
      'I will not charge candidates any fee, deposit, payment, or other monetary consideration for providing an internship opportunity or issuing an internship completion/experience certificate.',
  },
  {
    id: 'legitimate_use',
    label:
      'I will use this platform only for legitimate internship and recruitment-related purposes and will not use it to collect candidates’ personal data for unrelated purposes.',
  },
  {
    id: 'protect_pii',
    label:
      'I will protect candidates’ personal information and will not misuse, sell, share, or disclose such information except where necessary for legitimate internship/recruitment activities or as permitted by applicable law.',
  },
  {
    id: 'honest_jd',
    label:
      'I will provide accurate and honest information about the internship, including the role, responsibilities, project requirements, eligibility criteria, duration, location/work mode, stipend (if any), and other material conditions.',
  },
  {
    id: 'experience_letter',
    label:
      'I will provide an internship completion or experience letter to candidates who successfully complete the internship in accordance with the agreed internship terms.',
  },
  {
    id: 'verification_requests',
    label:
      'Where appropriate, I will reasonably respond to genuine future employment or experience-verification requests relating to candidates who have completed their internship with me/our organization.',
  },
];

/** Every item must be explicitly Accepted (`true`). Reject / missing = incomplete. */
export function allEthicsChecked(acks) {
  const map = acks && typeof acks === 'object' ? acks : {};
  return EMPLOYER_ETHICS_ITEMS.every((item) => map[item.id] === true);
}

/** Locked after a successful save with all items Accepted (`ethics_accepted_at` set). */
export function isEthicsLocked(profile) {
  if (!profile) return false;
  return Boolean(profile.ethics_accepted_at) && allEthicsChecked(profile.ethics_acks);
}

/** Normalize Accept/Reject map from client payload. */
export function normalizeEthicsAcks(incoming) {
  const raw = incoming && typeof incoming === 'object' ? incoming : {};
  const out = {};
  for (const item of EMPLOYER_ETHICS_ITEMS) {
    if (raw[item.id] === true) out[item.id] = true;
    else if (raw[item.id] === false) out[item.id] = false;
  }
  return out;
}

export function ethicsMapsEqual(a, b) {
  const left = a && typeof a === 'object' ? a : {};
  const right = b && typeof b === 'object' ? b : {};
  return EMPLOYER_ETHICS_ITEMS.every((item) => left[item.id] === right[item.id]);
}
