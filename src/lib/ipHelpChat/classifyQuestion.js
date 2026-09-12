const TOPICS = [
  'authentication',
  'candidate',
  'employer',
  'superadmin',
  'internships',
  'messaging',
  'troubleshooting',
];

const TOPIC_HINTS = {
  authentication: [
    'sign in',
    'login',
    'password',
    'captcha',
    'register',
    'sign up',
    'google',
    'forgot password',
    '2fa',
    'otp',
  ],
  candidate: ['candidate', 'apply', 'application', 'profile', 'offer', 'browse'],
  employer: ['employer', 'post internship', 'applicant', 'ethics', 'company'],
  superadmin: ['superadmin', 'super admin', 'approve employer', 'form registration'],
  internships: ['internship', 'internships', 'posting', 'guidelines', 'fairness'],
  messaging: ['message', 'messages', 'inbox', 'reply', 'thread'],
  troubleshooting: ['not working', 'error', 'broken', 'cannot', "can't", 'issue', 'problem', 'failed'],
};

const UNSUPPORTED_HINTS = [
  'write code',
  'homework',
  'weather',
  'stock tip',
  'medical advice',
  'bitcoin',
  'recipe',
  'joke about',
];

/**
 * Deterministic topic classification — does not answer the user.
 * @returns {{ topic: string, score: number, unsupported: boolean }}
 */
export function classifyQuestion(question, { role = null, pageTopic = null } = {}) {
  const q = String(question || '')
    .toLowerCase()
    .trim();
  if (!q) return { topic: 'unknown', score: 0, unsupported: false };

  if (UNSUPPORTED_HINTS.some((h) => q.includes(h))) {
    return { topic: 'unknown', score: 0, unsupported: true };
  }

  const scores = Object.fromEntries(TOPICS.map((t) => [t, 0]));
  for (const topic of TOPICS) {
    for (const hint of TOPIC_HINTS[topic]) {
      if (q.includes(hint)) scores[topic] += hint.length > 8 ? 2 : 1;
    }
  }

  if (pageTopic && scores[pageTopic] != null) scores[pageTopic] += 1.5;

  const roleKey = String(role || '').toLowerCase();
  if (roleKey === 'candidate') scores.candidate += 0.5;
  if (roleKey === 'employer') scores.employer += 0.5;
  if (roleKey === 'superadmin') scores.superadmin += 0.5;

  let best = 'unknown';
  let bestScore = 0;
  for (const topic of TOPICS) {
    if (scores[topic] > bestScore) {
      bestScore = scores[topic];
      best = topic;
    }
  }

  if (bestScore < 1) return { topic: 'unknown', score: bestScore, unsupported: false };
  return { topic: best, score: bestScore, unsupported: false };
}

export const HELP_TOPICS = TOPICS;
