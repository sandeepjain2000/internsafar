/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const EMPLOYER_KNOWLEDGE = [
  {
    id: 'employer.home',
    topic: 'employer',
    roles: ['employer', 'guest'],
    keywords: ['employer dashboard', 'employer home'],
    facts: [
      'After login, employers use /employer as their home dashboard.',
      'Employers manage internships, applicants, offers, messages, and profile from there.',
    ],
  },
  {
    id: 'employer.post',
    topic: 'employer',
    roles: ['employer'],
    keywords: ['post internship', 'create internship', 'new posting', 'publish'],
    facts: [
      'Create a posting from /employer/internships/new (or Internships in the employer area).',
      'Every internship post requires accepting fairness guidelines.',
      'Employers should complete Profile & docs (including ethics) before live posts.',
      'SuperAdmin approval may be required before an employer can post live.',
    ],
  },
  {
    id: 'employer.share_posting',
    topic: 'employer',
    roles: ['employer', 'guest'],
    keywords: ['share', 'share posting', 'share internship', 'copy link', 'whatsapp', 'linkedin', 'posting link'],
    facts: [
      'Published postings have a Share button on /employer/internships with three options: WhatsApp, LinkedIn, and Copy Link.',
      'The link opens the posting for candidates. Visitors who are not signed in are asked to sign in or register as a candidate and are then taken back to the posting.',
      'LinkedIn on Android opens the phone share menu with the post text and link; on iPhone only the link is shared; on a computer LinkedIn opens with the post ready.',
      'Copy Link copies the posting link to paste anywhere.',
    ],
  },
  {
    id: 'employer.applicants',
    topic: 'employer',
    roles: ['employer'],
    keywords: ['applicant', 'applicants', 'review candidates', 'pipeline'],
    facts: [
      'Review applicants from employer internship detail pages under /employer/internships.',
      'Search candidates is available under the employer candidates area.',
    ],
  },
  {
    id: 'employer.profile',
    topic: 'employer',
    roles: ['employer'],
    keywords: ['employer profile', 'ethics', 'documents', 'verification'],
    facts: [
      'Employer profile is at /employer/profile.',
      'Complete ethics checkboxes and profile docs as part of verification.',
    ],
  },
];
