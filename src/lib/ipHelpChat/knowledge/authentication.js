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
      'Sign in is on the home page / with email and password only — there is no Google sign-in on login.',
      'Security Verification (CAPTCHA) may appear on login; New Code regenerates the arithmetic challenge.',
      'Google is used only during candidate (and employer) registration to verify identity; a temporary password is emailed for later sign-in.',
      'Forgot password is available at /forgot-password.',
      'Change password after sign-in from Account settings.',
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
      'Sign up with Google verifies identity, then a temporary password is emailed; sign in with email and password (not Google).',
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
