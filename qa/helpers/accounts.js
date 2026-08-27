/** InternSafar core demo accounts (scripts/lib/ipCoreSampleConfig.js). */
module.exports = {
  password: 'Admin@123',
  candidate: { email: 'lawsonlclintern+1@gmail.com', home: /\/candidate(\/|$|\?)/ },
  employer: { email: 'shreekar.nyayapathi23+2@vit.edu', home: /\/employer(\/|$|\?)/ },
  // Exclude /superadmin/login — that path is the gate, not the dashboard.
  superadmin: { email: 'placementhubsupport@gmail.com', home: /\/superadmin(?!\/login)(\/|$|\?)/ },
};
