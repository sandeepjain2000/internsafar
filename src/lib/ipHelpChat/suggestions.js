import {
  helpFollowUpsForRole,
  helpStartersForRole,
  helpWelcomeForRole,
} from '@/lib/ipHelpChatContext';

const PAGE_SUGGESTIONS = {
  '/candidate/internships': ['How do I apply for an internship?', 'How do I track my applications?'],
  '/candidate/applications': ['How do I track my applications?', 'How do I browse internships?'],
  '/candidate/profile': ['How do I update my profile?', 'How do I apply for an internship?'],
  '/employer/internships/new': ['How do I post an internship?', 'How does employer verification work?'],
  '/employer/profile': ['How does employer verification work?', 'How do I post an internship?'],
  '/register/candidate': ['How do I register as a candidate?', 'How do I sign in?'],
  '/register/employer': ['How do I register as an employer?', 'How do I sign in?'],
  '/': ['How do I sign in?', 'How do I register as a candidate?'],
};

export function helpStarters({ role, pathname } = {}) {
  const base = helpStartersForRole(role);
  const page = PAGE_SUGGESTIONS[String(pathname || '')] || [];
  const merged = [...page, ...base];
  const seen = new Set();
  return merged.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

export function helpFollowUps({ role, topic, pathname } = {}) {
  const base = helpFollowUpsForRole(role);
  const page = PAGE_SUGGESTIONS[String(pathname || '')] || [];
  const topicHints =
    topic === 'messaging'
      ? ['Where is How it works?']
      : topic === 'authentication'
        ? ['How do I sign in?', 'Where is How it works?']
        : [];
  const merged = [...page, ...topicHints, ...base];
  const seen = new Set();
  return merged.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

export { helpWelcomeForRole };
