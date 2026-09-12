import { ALL_HELP_KNOWLEDGE, knowledgeByTopic } from './knowledge/index.js';

function roleAllowed(entry, role) {
  if (!entry.roles || !entry.roles.length) return true;
  const key = String(role || 'guest').toLowerCase() || 'guest';
  if (entry.roles.includes(key)) return true;
  if (key === 'guest' && entry.roles.includes('guest')) return true;
  // Guests may see general auth/internship facts tagged with candidate/employer guest-inclusive lists
  return entry.roles.includes('guest');
}

/**
 * RAG-lite: pick relevant knowledge entries only (not the full corpus).
 * @returns {{ entries: import('./knowledge/authentication').HelpKnowledgeEntry[], knowledgeIds: string[], factsText: string }}
 */
export function retrieveKnowledge({ topic, role, question, limit = 4 } = {}) {
  const q = String(question || '').toLowerCase();
  let pool =
    topic && topic !== 'unknown' ? knowledgeByTopic(topic) : ALL_HELP_KNOWLEDGE.slice();

  pool = pool.filter((e) => roleAllowed(e, role));

  const scored = pool.map((entry) => {
    let score = 0;
    for (const kw of entry.keywords || []) {
      if (q.includes(String(kw).toLowerCase())) score += 2;
    }
    if (topic && entry.topic === topic) score += 1;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  let selected = scored.filter((s) => s.score > 0).slice(0, limit).map((s) => s.entry);

  // Fallback: top role-allowed entries for the topic even without keyword hits
  if (!selected.length && topic && topic !== 'unknown') {
    selected = pool.slice(0, Math.min(2, limit));
  }

  // Last resort: troubleshooting common
  if (!selected.length) {
    selected = ALL_HELP_KNOWLEDGE.filter((e) => e.id === 'trouble.common').slice(0, 1);
  }

  const factsText = selected
    .map((e) => `[${e.id}]\n- ${e.facts.join('\n- ')}`)
    .join('\n\n');

  return {
    entries: selected,
    knowledgeIds: selected.map((e) => e.id),
    factsText,
  };
}
