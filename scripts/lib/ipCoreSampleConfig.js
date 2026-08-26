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

/**
 * Extra candidate accounts re-seeded after reset.
 * Each name must be unique — offers/applications must not look like the same person repeated.
 */
const CAST_CANDIDATES = [
  { email: 'lawsonlclintern+1@gmail.com', name: 'Priya Sharma', skills: ['React', 'TypeScript', 'Node'] },
  { email: 'lawsonlclintern+2@gmail.com', name: 'Arjun Mehta', skills: ['Python', 'SQL', 'ML'] },
  { email: 'lawsonlclintern+3@gmail.com', name: 'Meera Iyer', skills: ['Java', 'Spring', 'SQL'] },
  { email: 'lawsonlclintern+4@gmail.com', name: 'Kabir Reddy', skills: ['Figma', 'UX Research'] },
  { email: 'lawsonlclintern+5@gmail.com', name: 'Ananya Patel', skills: ['Node.js', 'Express', 'MongoDB'] },
  { email: 'lawsonlclintern+6@gmail.com', name: 'Rohan Das', skills: ['AWS', 'Docker', 'Linux'] },
  { email: 'lawsonlclintern+7@gmail.com', name: 'Ishita Nair', skills: ['Selenium', 'Cypress', 'Jest'] },
  { email: 'lawsonlclintern+8@gmail.com', name: 'Vikram Gupta', skills: ['TensorFlow', 'Python', 'NLP'] },
];

/**
 * Extra employer accounts re-seeded after reset.
 * Multiple approved employers so offers are not always from the same company.
 */
const CAST_EMPLOYERS = [
  { email: 'shreekar.nyayapathi23+2@vit.edu', company: 'Nova Labs', status: 'approved' },
  { email: 'shreekar.nyayapathi23+3@vit.edu', company: 'Pulse Media', status: 'pending' },
  { email: 'shreekar.nyayapathi23+4@vit.edu', company: 'BrightPath Analytics', status: 'approved' },
  { email: 'shreekar.nyayapathi23+5@vit.edu', company: 'Cedar Softworks', status: 'approved' },
  { email: 'shreekar.nyayapathi23+6@vit.edu', company: 'Orbit Fintech', status: 'approved' },
];

const CAST_CANDIDATE_EMAILS = CAST_CANDIDATES.map((c) => c.email);
const CAST_EMPLOYER_EMAILS = CAST_EMPLOYERS.map((e) => e.email);

/** Accounts preserved during nuclear reset — everyone else is removed and re-seeded. */
const PRESERVE_USER_EMAILS = [SUPERADMIN_EMAIL];

/**
 * Protected accounts for generate/delete-by-run-ID tooling.
 * NEVER delete, deactivate, rename, change role/email/password of these.
 */
const PROTECTED_ACCOUNT_EMAILS = [
  SUPERADMIN_EMAIL,
  CAND_BASE,
  EMP_BASE,
].map((e) => String(e).trim().toLowerCase());

function assertProtectedConfigValid() {
  if (!Array.isArray(PROTECTED_ACCOUNT_EMAILS) || PROTECTED_ACCOUNT_EMAILS.length < 1) {
    throw new Error('PROTECTED_ACCOUNT_EMAILS missing or empty in ipCoreSampleConfig');
  }
  for (const email of PROTECTED_ACCOUNT_EMAILS) {
    if (!email || !email.includes('@')) {
      throw new Error(`Invalid protected account email: ${email}`);
    }
  }
  return true;
}

function isProtectedEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return PROTECTED_ACCOUNT_EMAILS.includes(e);
}

function allCoreSampleEmails() {
  return [
    SUPERADMIN_EMAIL,
    CAND_BASE,
    EMP_BASE,
    ...CAST_CANDIDATE_EMAILS,
    ...CAST_EMPLOYER_EMAILS,
  ];
}

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
  PROTECTED_ACCOUNT_EMAILS,
  assertProtectedConfigValid,
  isProtectedEmail,
  allCoreSampleEmails,
  pendingCastEmployer,
};
