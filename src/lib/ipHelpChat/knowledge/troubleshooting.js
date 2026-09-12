/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const TROUBLESHOOTING_KNOWLEDGE = [
  {
    id: 'trouble.common',
    topic: 'troubleshooting',
    keywords: ['not working', 'error', 'cannot', "can't", 'failed', 'problem', 'issue', 'help'],
    facts: [
      'If sign-in fails, confirm email/password, complete CAPTCHA, and try New Code.',
      'If Google sign-in fails with "not linked", register with Sign up with Google first.',
      'For product guidance without inventing features, use /help and /how-it-works.',
      'InternSafar Help does not provide live support tickets or human agents in-app.',
    ],
  },
];
