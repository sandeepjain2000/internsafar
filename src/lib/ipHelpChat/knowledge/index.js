import { AUTH_KNOWLEDGE } from './authentication';
import { CANDIDATE_KNOWLEDGE } from './candidate';
import { EMPLOYER_KNOWLEDGE } from './employer';
import { SUPERADMIN_KNOWLEDGE } from './superadmin';
import { INTERNSHIPS_KNOWLEDGE } from './internships';
import { MESSAGING_KNOWLEDGE } from './messaging';
import { TROUBLESHOOTING_KNOWLEDGE } from './troubleshooting';

/** @type {import('./authentication').HelpKnowledgeEntry[]} */
export const ALL_HELP_KNOWLEDGE = [
  ...AUTH_KNOWLEDGE,
  ...CANDIDATE_KNOWLEDGE,
  ...EMPLOYER_KNOWLEDGE,
  ...SUPERADMIN_KNOWLEDGE,
  ...INTERNSHIPS_KNOWLEDGE,
  ...MESSAGING_KNOWLEDGE,
  ...TROUBLESHOOTING_KNOWLEDGE,
];

export function knowledgeByTopic(topic) {
  const t = String(topic || '');
  return ALL_HELP_KNOWLEDGE.filter((e) => e.topic === t);
}
