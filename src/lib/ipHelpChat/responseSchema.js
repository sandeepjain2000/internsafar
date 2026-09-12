import { plainTextHelpReply } from '@/lib/ipHelpChatContext';
import { resolveHelpActions } from './actions';
import { resolveHelpResources } from './resources';

export const FALLBACK_STATES = [
  'answered',
  'insufficient_knowledge',
  'unsupported',
  'service_unavailable',
];

/**
 * Normalize model text + server registries into a safe client payload.
 * Never trusts model-generated URLs.
 */
export function normalizeHelpResponse({
  rawText,
  topic,
  role,
  fallbackState = 'answered',
  knowledgeIds = [],
} = {}) {
  let text = plainTextHelpReply(rawText);
  const suggestedIds = [];
  const actionsLine = text.match(/\bACTIONS:\s*([a-z0-9_,\s-]+)/i);
  if (actionsLine) {
    suggestedIds.push(
      ...actionsLine[1]
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    text = text.replace(/\bACTIONS:\s*[a-z0-9_,\s-]+/i, '').trim();
  }

  const state = FALLBACK_STATES.includes(fallbackState) ? fallbackState : 'answered';
  const actions = resolveHelpActions({ topic, role, suggestedIds });
  const relatedResources = resolveHelpResources({ topic });

  return {
    ok: true,
    reply: text,
    answer: text,
    actions,
    relatedResources,
    fallbackState: state,
    topic: topic || 'unknown',
    knowledgeIds,
  };
}

export function staticFallbackResponse({ fallbackState, topic, role, answer }) {
  return normalizeHelpResponse({
    rawText: answer,
    topic,
    role,
    fallbackState,
    knowledgeIds: [],
  });
}
