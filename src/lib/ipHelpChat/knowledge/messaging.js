/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const MESSAGING_KNOWLEDGE = [
  {
    id: 'messaging.inbox',
    topic: 'messaging',
    roles: ['candidate', 'employer'],
    keywords: ['message', 'messages', 'inbox', 'chat', 'reply'],
    facts: [
      'Messaging uses an email-style inbox (subject = last message), not chat-bubble threads.',
      'Candidates: /candidate/messages. Employers: /employer/messages.',
      'From My Applications, Message opens an existing thread or creates one for that applied internship.',
    ],
  },
];
