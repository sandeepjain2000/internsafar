/**
 * @typedef {{ id: string, topic: string, roles?: string[], keywords: string[], facts: string[] }} HelpKnowledgeEntry
 */

/** @type {HelpKnowledgeEntry[]} */
export const AUTH_KNOWLEDGE = [
  {
    id: 'auth.signin',
    topic: 'authentication',
    keywords: ['sign in', 'login', 'log in', 'password', 'captcha', 'google sign'],
    facts: [
      'Sign in is on the home page / with email and password.',
      'Security Verification (CAPTCHA) may appear on login; New Code regenerates the arithmetic challenge.',
      'Google sign-in opens a portal session only for accounts already linked via Sign up with Google (ip_google_identities).',
      'Password-only accounts without a Google link cannot sign in with Google.',
      'Forgot password is available at /forgot-password.',
    ],
  },
  {
    id: 'auth.register.candidate',
    topic: 'authentication',
    roles: ['guest', 'candidate'],
    keywords: ['register candidate', 'sign up candidate', 'gmail', 'candidate registration'],
    facts: [
      'Candidates register at /register/candidate.',
      'Candidate signup is Gmail-oriented (@gmail.com / @googlemail.com).',
      'Sign up with Google verifies identity and can open an authenticated candidate session after registration.',
    ],
  },
  {
    id: 'auth.register.employer',
    topic: 'authentication',
    roles: ['guest', 'employer'],
    keywords: ['register employer', 'sign up employer', 'employer registration', 'approval'],
    facts: [
      'Employers register at /register/employer.',
      'Employers may use work email / domain or a form path.',
      'Some employer registrations need SuperAdmin approval before the account is active for posting.',
    ],
  },
];
