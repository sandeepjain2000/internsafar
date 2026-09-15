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
      'Form registrations and approvals are available under SuperAdmin routes such as /superadmin/approvals and /superadmin/form-registrations.',
    ],
  },
];
