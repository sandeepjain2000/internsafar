/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const INTERNSHIPS_KNOWLEDGE = [
  {
    id: 'internships.browse',
    topic: 'internships',
    roles: ['candidate', 'guest'],
    keywords: ['browse', 'internship', 'internships', 'search internship', 'find internship'],
    facts: [
      'Candidates browse open internships at /candidate/internships.',
      'Open a posting detail page to read requirements and apply when eligible.',
    ],
  },
  {
    id: 'internships.shared_link',
    topic: 'internships',
    roles: ['candidate', 'guest', 'employer'],
    keywords: [
      'link', 'shared link', 'posting link', 'internship link', 'share link', 'whatsapp', 'linkedin',
      'taken back', 'sign in to view', 'log in to view', 'opened a link', 'not specified', 'dash',
    ],
    facts: [
      'A shared internship link opens that posting\'s detail page (/candidate/internships/<id>).',
      'Signed in as a candidate: the posting details open directly.',
      'Not signed in: the sign-in page shows an "Internship link" notice. Existing candidates sign in with their email and password (not Google); you are then taken back to that internship.',
      'New candidates tap "Register as a candidate", register with Google, and get a temporary password by email. Then sign in with email and that password; the link is remembered on the same device for 24 hours, so you still return to the internship.',
      'Signed in as an employer or SuperAdmin: the page says "Sign in as a candidate to view this internship"; Sign out returns to sign-in and then back to the link.',
      'The detail page lists every detail the employer entered. A "—" means the employer did not fill in that detail.',
    ],
  },
  {
    id: 'internships.guidelines',
    topic: 'internships',
    keywords: ['guidelines', 'fairness', 'ethics'],
    facts: [
      'Fairness guidelines apply to internship posts.',
      'Public guidelines page: /guidelines.',
      'Help Center: /help. How it works: /how-it-works.',
    ],
  },
];
