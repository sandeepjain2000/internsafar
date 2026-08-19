/**
 * *** ONLY FILE TO EDIT for core-sample / reset baseline emails ***
 *
 * IP_Reset_Core_Sample.cmd, reset-ip-core-sample.mjs, and seed-gmail-plus-cast.mjs
 * all read from here. Change emails/names below — no other file needs updating.
 *
 * @module scripts/lib/ipCoreSampleConfig
 */

/** SuperAdmin — kept during reset (not deleted). */
const SUPERADMIN_EMAIL = 'placementhubsupport@gmail.com';
const LEGACY_SUPERADMIN_EMAIL = 'superadmin@internship.local';
const DEMO_PASSWORD = 'Admin@123';

/** Primary showcase candidate — removed on reset, then re-created. */
const CAND_BASE = 'lawsonlclintern+1@gmail.com';
const CAND_BASE_NAME = 'Priya Sharma';

/** Primary showcase employer — removed on reset, then re-created. */
const EMP_BASE = 'shreekar.nyayapathi23+2@vit.edu';
const EMP_BASE_NAME = 'Nova Labs';

/** Extra candidate accounts re-seeded after reset. */
const CAST_CANDIDATES = [
  { email: 'lawsonlclintern+1@gmail.com', name: 'Priya Sharma', skills: ['React', 'TypeScript', 'Node'] },
  { email: 'lawsonlclintern+2@gmail.com', name: 'Arjun Mehta', skills: ['Python', 'SQL', 'ML'] },
  { email: 'lawsonlclintern+3@gmail.com', name: 'Meera Iyer', skills: ['Java', 'Spring', 'SQL'] },
];

/** Extra employer accounts re-seeded after reset. */
const CAST_EMPLOYERS = [
  { email: 'shreekar.nyayapathi23+2@vit.edu', company: 'Nova Labs', status: 'approved' },
  { email: 'shreekar.nyayapathi23+3@vit.edu', company: 'Pulse Media', status: 'pending' },
];

const CAST_CANDIDATE_EMAILS = CAST_CANDIDATES.map((c) => c.email);
const CAST_EMPLOYER_EMAILS = CAST_EMPLOYERS.map((e) => e.email);

/** Accounts preserved during reset — everyone else is removed and re-seeded. */
const PRESERVE_USER_EMAILS = [SUPERADMIN_EMAIL];

function allCoreSampleEmails() {
  return [
    SUPERADMIN_EMAIL,
    CAND_BASE,
    EMP_BASE,
    ...CAST_CANDIDATE_EMAILS,
    ...CAST_EMPLOYER_EMAILS,
  ];
}

/** Pending cast employer used for SuperAdmin manual-request demo row. */
function pendingCastEmployer() {
  return CAST_EMPLOYERS.find((e) => e.status === 'pending') || CAST_EMPLOYERS[CAST_EMPLOYERS.length - 1];
}

module.exports = {
  SUPERADMIN_EMAIL,
  LEGACY_SUPERADMIN_EMAIL,
  DEMO_PASSWORD,
  CAND_BASE,
  CAND_BASE_NAME,
  EMP_BASE,
  EMP_BASE_NAME,
  CAST_CANDIDATES,
  CAST_EMPLOYERS,
  CAST_CANDIDATE_EMAILS,
  CAST_EMPLOYER_EMAILS,
  PRESERVE_USER_EMAILS,
  allCoreSampleEmails,
  pendingCastEmployer,
};
