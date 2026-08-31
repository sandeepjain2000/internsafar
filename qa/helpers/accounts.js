/** InternSafar core demo accounts (scripts/lib/ipCoreSampleConfig.js). */
module.exports = {
  password: 'Admin@123',
  candidate: { email: 'lawsonlclintern+1@gmail.com', home: /\/candidate(\/|$|\?)/ },
  employer: { email: 'placementhubsupport@gmail.com', home: /\/employer(\/|$|\?)/ },
  // Filler employer awaiting SuperAdmin approval — a +alias of the core employer.
  employerPending: { email: 'placementhubsupport+3@gmail.com', home: /\/employer(\/|$|\?)/ },
  // Exclude /superadmin/login — that path is the gate, not the dashboard.
  superadmin: { email: 'support@placementhub.online', home: /\/superadmin(?!\/login)(\/|$|\?)/ },
};
