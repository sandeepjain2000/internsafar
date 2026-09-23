/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const TROUBLESHOOTING_KNOWLEDGE = [
  {
    id: 'trouble.common',
    topic: 'troubleshooting',
    keywords: ['not working', 'error', 'cannot', "can't", 'failed', 'problem', 'issue', 'help'],
    facts: [
      'If sign-in fails, confirm email/password, complete CAPTCHA, and try New Code.',
      'There is no Google sign-in on the login page. After Google registration, use the emailed temporary password (or Forgot password).',
      'For product guidance without inventing features, use /help and /how-it-works.',
      'InternSafar Help does not provide live support tickets or human agents in-app.',
    ],
  },
];
