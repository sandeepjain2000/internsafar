/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const SUPERADMIN_KNOWLEDGE = [
  {
    id: 'superadmin.home',
    topic: 'superadmin',
    roles: ['superadmin'],
    keywords: ['superadmin', 'admin dashboard', 'approvals'],
    facts: [
      'SuperAdmin signs in on the standard home page (`/`) with email and password, then lands on `/superadmin`.',
      'SuperAdmin can approve employer registrations and manage portal oversight tools.',
      'Employer approvals are under /superadmin/approvals (Domain and Free-email). Form registrations and Manual requests are retired (410). Resend employer email verify from login or post-register.',
    ],
  },
];
