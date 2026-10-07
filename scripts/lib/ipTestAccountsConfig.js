/**
 * *** ONLY FILE TO EDIT for the disposable QA test accounts ***
 *
 * Testing (Playwright, qa:* scripts, manual test steps) signs in as these accounts — never as
 * the core candidate / employer in ipCoreSampleConfig.js (owner rule 2026-10-07: core accounts
 * are demo-only). The one SuperAdmin is shared: tests use it to act on test accounts but never
 * change the SuperAdmin account itself.
 *
 * Test accounts are disposable. IP_Reset_Core_Sample.js deletes them with every other non-core
 * user; `npm run qa:ensure-test-accounts` (also run by Playwright global setup) re-creates them.
 *
 * @module scripts/lib/ipTestAccountsConfig
 */
const {
  CAND_BASE,
  EMP_BASE,
  getCorePasswordForRole,
  isProtectedEmail,
} = require('./ipCoreSampleConfig');

const TEST_CANDIDATE = {
  email: 'lawsonlclintern+qa1@gmail.com',
  firstName: 'Ananya',
  lastName: 'Rao',
  phone: '9000000111',
  skills: ['JavaScript', 'React', 'SQL'],
  education: {
    college: 'College of Engineering Pune',
    degree: 'B.Tech',
    specialization: 'Computer Engineering',
    studyStatus: 'Studying',
    graduationYear: 2027,
    cgpa: '8.30',
    city: 'Pune',
    state: 'Maharashtra',
    previous: { college: 'Fergusson College, Pune', degree: 'Class XII', specialization: 'Science (PCM)', score: '87%' },
  },
};

/** Second candidate for cross-user checks (cannot read / act on the first candidate's offers or threads). */
const TEST_CANDIDATE_OTHER = {
  email: 'lawsonlclintern+qa2@gmail.com',
  firstName: 'Kabir',
  lastName: 'Menon',
  phone: '9000000114',
  skills: ['Python', 'Excel', 'Power BI'],
  education: {
    college: 'Christ University, Bengaluru',
    degree: 'B.Com',
    specialization: 'Business Analytics',
    studyStatus: 'Studying',
    graduationYear: 2026,
    cgpa: '8.05',
    city: 'Bengaluru',
    state: 'Karnataka',
    previous: { college: 'Bishop Cotton Boys School, Bengaluru', degree: 'Class XII', specialization: 'Commerce', score: '85%' },
  },
};

const TEST_EMPLOYER = {
  email: 'placementhubsupport+qa1@gmail.com',
  company: 'Kestrel Analytics',
  contactName: 'Rohan Iyer',
  designation: 'Talent Lead',
  phone: '9000000112',
  status: 'approved',
};

const TEST_EMPLOYER_PENDING = {
  email: 'placementhubsupport+qa2@gmail.com',
  company: 'Harborline Logistics',
  contactName: 'Sneha Kulkarni',
  designation: 'HR Manager',
  phone: '9000000113',
  status: 'pending',
};

/** Open postings kept on the approved test employer. No screening questions, so tests can apply directly. */
const TEST_POSTINGS = [
  { title: 'Data Analyst Intern', city: 'Pune', workMode: 'Remote', stipend: 15000 },
  { title: 'Frontend Developer Intern', city: 'Bengaluru', workMode: 'Hybrid', stipend: 18000 },
];

const TEST_ACCOUNT_EMAILS = [
  TEST_CANDIDATE.email,
  TEST_CANDIDATE_OTHER.email,
  TEST_EMPLOYER.email,
  TEST_EMPLOYER_PENDING.email,
].map((e) => e.toLowerCase());

/** Core logins that testing must never use. SuperAdmin is excluded: tests share the one SuperAdmin. */
const CORE_TEST_BLOCKED_EMAILS = [CAND_BASE, EMP_BASE].map((e) => String(e).trim().toLowerCase());

function getTestPassword() {
  return getCorePasswordForRole('candidate');
}

function isTestAccountEmail(email) {
  return TEST_ACCOUNT_EMAILS.includes(String(email || '').trim().toLowerCase());
}

function assertNotCoreForTesting(email) {
  const e = String(email || '').trim().toLowerCase();
  if (CORE_TEST_BLOCKED_EMAILS.includes(e)) {
    throw new Error(
      `${e} is a core demo account and must not be used for testing. Use the test accounts in scripts/lib/ipTestAccountsConfig.js.`,
    );
  }
}

function assertTestConfigValid() {
  for (const email of TEST_ACCOUNT_EMAILS) {
    if (isProtectedEmail(email)) throw new Error(`Test account ${email} collides with a core account`);
  }
  return true;
}

module.exports = {
  TEST_CANDIDATE,
  TEST_CANDIDATE_OTHER,
  TEST_EMPLOYER,
  TEST_EMPLOYER_PENDING,
  TEST_POSTINGS,
  TEST_ACCOUNT_EMAILS,
  CORE_TEST_BLOCKED_EMAILS,
  getTestPassword,
  isTestAccountEmail,
  assertNotCoreForTesting,
  assertTestConfigValid,
};
