/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const CANDIDATE_KNOWLEDGE = [
  {
    id: 'candidate.home',
    topic: 'candidate',
    roles: ['candidate', 'guest'],
    keywords: ['candidate dashboard', 'candidate home', 'my dashboard'],
    facts: [
      'After login, candidates use /candidate as their home dashboard.',
      'From there they can open browse, applications, offers, messages, notifications, profile, and ideas.',
    ],
  },
  {
    id: 'candidate.profile',
    topic: 'candidate',
    roles: ['candidate'],
    keywords: ['profile', 'update profile', 'academics', 'cv', 'resume'],
    facts: [
      'Candidate profile is at /candidate/profile.',
      'Keep profile details current before applying to internships.',
    ],
  },
  {
    id: 'candidate.applications',
    topic: 'candidate',
    roles: ['candidate'],
    keywords: ['application', 'applications', 'track apply', 'my applications', 'withdraw'],
    facts: [
      'Track applications at /candidate/applications.',
      'Candidates apply from an internship detail page when the posting is open.',
    ],
  },
  {
    id: 'candidate.offers',
    topic: 'candidate',
    roles: ['candidate'],
    keywords: ['offer', 'offers', 'accept offer', 'decline'],
    facts: ['Candidate offers are listed at /candidate/offers.'],
  },
];
