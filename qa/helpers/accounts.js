/** InternSafar QA accounts.
 * Candidate / employers are the disposable test accounts (scripts/lib/ipTestAccountsConfig.js),
 * re-created by qa/global-setup.js. Core demo accounts are never used for testing; the one
 * SuperAdmin is shared and only acts on test accounts.
 * Passwords: .env.local IP_QA_CORE_PASSWORD / IP_QA_SUPERADMIN_PASSWORD via ipCoreSampleConfig.
 * AWS/production packs use coreaccountspass.json in the handoff extract.
 */
const {
  getCorePasswordForEmail,
  getCorePasswordForRole,
  SUPERADMIN_EMAIL,
} = require('../../scripts/lib/ipCoreSampleConfig.js');
const {
  TEST_CANDIDATE,
  TEST_EMPLOYER,
  TEST_EMPLOYER_PENDING,
} = require('../../scripts/lib/ipTestAccountsConfig.js');

module.exports = {
  get password() {
    return getCorePasswordForRole('candidate');
  },
  passwordFor(email) {
    return getCorePasswordForEmail(email);
  },
  candidate: { email: TEST_CANDIDATE.email, home: /\/candidate(\/|$|\?)/ },
  employer: { email: TEST_EMPLOYER.email, home: /\/employer(\/|$|\?)/ },
  employerPending: { email: TEST_EMPLOYER_PENDING.email, home: /\/employer(\/|$|\?)/ },
  // Exclude /superadmin/login — that path is the gate, not the dashboard.
  superadmin: { email: SUPERADMIN_EMAIL || 'support@placementhub.online', home: /\/superadmin(?!\/login)(\/|$|\?)/ },
};
