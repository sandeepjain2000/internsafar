/**
 * *** ONLY FILE TO EDIT for core-sample / reset baseline emails ***
 *
 * IP_Reset_Core_Sample.cmd, reset-ip-core-sample.mjs, and seed-gmail-plus-cast.mjs
 * all read from here. Change emails/names below — no other file needs updating.
 *
 * @module scripts/lib/ipCoreSampleConfig
 */

/**
 * SuperAdmin — kept during reset (not deleted). Single account, so it takes the
 * Zoho support address: Zoho does not support plus-addressing, and SuperAdmin
 * never needs +aliases. Keep this in step with src/lib/ensureIpBootstrap.js,
 * which recreates this account on boot.
 */
const SUPERADMIN_EMAIL = 'support@placementhub.online';
const LEGACY_SUPERADMIN_EMAIL = 'superadmin@internship.local';
const DEMO_PASSWORD = 'Admin@123';

/** Primary showcase candidate — removed on reset, then re-created. */
const CAND_BASE = 'lawsonlclintern+1@gmail.com';
const CAND_BASE_NAME = 'Priya Sharma';

/**
 * Primary showcase employer — removed on reset, then re-created.
 * On the Gmail mailbox because the employer side needs many filler logins and
 * Gmail delivers +aliases natively (Zoho does not).
 */
const EMP_BASE = 'placementhubsupport@gmail.com';
const EMP_BASE_NAME = 'Nova Labs';
/** Company site for every seeded employer. */
const EMP_BASE_WEBSITE = 'https://placementhub.online';

/** Extra candidate accounts re-seeded after reset. */
/**
 * Cast candidates, with the education each one is seeded with.
 *
 * `education` must stay in step with db/migrations/035_ip_seed_candidate_academics.sql, which
 * seeds the same three candidates' ip_candidate_academics rows. Both read from the same values
 * so a fresh seed and a migrated database agree. Previously the seeder hardcoded one identical
 * set (VIT / B.Tech / CSE / 2027 / 8.4) for every candidate, so on a clean database all three
 * demo candidates looked like the same person and 035 could not repair it (035 only fills
 * blanks). Keep these three distinct.
 */
const CAST_CANDIDATES = [
  {
    email: 'lawsonlclintern+1@gmail.com',
    name: 'Priya Sharma',
    skills: ['React', 'TypeScript', 'Node'],
    education: {
      college: 'Pune Institute of Computer Technology',
      degree: 'B.E.',
      specialization: 'Information Technology',
      studyStatus: 'Studying',
      graduationYear: 2027,
      cgpa: '8.62',
      city: 'Pune',
      state: 'Maharashtra',
      previous: { college: 'Kendriya Vidyalaya, Pune', degree: 'Class XII', specialization: 'Science (PCM)', score: '89%' },
    },
  },
  {
    email: 'lawsonlclintern+2@gmail.com',
    name: 'Arjun Mehta',
    skills: ['Python', 'SQL', 'ML'],
    education: {
      college: 'BMS College of Engineering',
      degree: 'B.Tech',
      specialization: 'Electronics and Communication',
      studyStatus: 'Studying',
      graduationYear: 2026,
      cgpa: '8.15',
      city: 'Bengaluru',
      state: 'Karnataka',
      previous: { college: 'Delhi Public School, Bengaluru', degree: 'Class XII', specialization: 'Science (PCM)', score: '84%' },
    },
  },
  {
    email: 'lawsonlclintern+3@gmail.com',
    name: 'Meera Iyer',
    skills: ['Java', 'Spring', 'SQL'],
    education: {
      college: 'SRM Institute of Science and Technology',
      degree: 'B.Tech',
      specialization: 'CSE',
      studyStatus: 'Studying',
      graduationYear: 2027,
      cgpa: '8.40',
      city: 'Chennai',
      state: 'Tamil Nadu',
      previous: { college: 'Loyola Junior College, Chennai', degree: 'Class XII', specialization: 'Science (PCM + CS)', score: '91%' },
    },
  },
];

/** Extra employer accounts re-seeded after reset. */
const CAST_EMPLOYERS = [
  { email: 'placementhubsupport@gmail.com', company: 'Nova Labs', status: 'approved', website: EMP_BASE_WEBSITE },
  { email: 'placementhubsupport+3@gmail.com', company: 'Pulse Media', status: 'pending', website: EMP_BASE_WEBSITE },
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
  EMP_BASE_WEBSITE,
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
