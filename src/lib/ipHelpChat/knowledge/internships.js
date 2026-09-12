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
