/** InternSafar core demo accounts (scripts/lib/ipCoreSampleConfig.js).
 * Sibling/Vercel QA: hardcoded Admin@123 via ipCoreSampleConfig (Neon).
 * AWS/production packs use coreaccountspass.json in the handoff extract.
 */
const {
  getCorePasswordForRole,
  CAND_BASE,
  EMP_BASE,
  SUPERADMIN_EMAIL,
} = require('../../scripts/lib/ipCoreSampleConfig.js');

module.exports = {
  get password() {
    return getCorePasswordForRole('candidate');
  },
  candidate: { email: CAND_BASE || 'lawsonlclintern+1@gmail.com', home: /\/candidate(\/|$|\?)/ },
  employer: { email: EMP_BASE || 'placementhubsupport@gmail.com', home: /\/employer(\/|$|\?)/ },
  // Filler employer awaiting SuperAdmin approval — a +alias of the core employer.
  employerPending: { email: 'placementhubsupport+3@gmail.com', home: /\/employer(\/|$|\?)/ },
  // Exclude /superadmin/login — that path is the gate, not the dashboard.
  superadmin: { email: SUPERADMIN_EMAIL || 'support@placementhub.online', home: /\/superadmin(?!\/login)(\/|$|\?)/ },
};
