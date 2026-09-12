import { nvidiaChat, NVIDIA_MODEL } from '@/lib/nvidiaLlm';
import { classifyQuestion } from './classifyQuestion';
import { retrieveKnowledge } from './retrieveKnowledge';
import { normalizePageContext } from './pageContext';
import { buildHelpSystemPrompt } from './systemPrompt';
import { allowedActionIdsForPrompt } from './actions';
import { normalizeHelpResponse, staticFallbackResponse } from './responseSchema';
import { helpFollowUps } from './suggestions';
import { recordHelpChatEvent } from './analytics';

const MAX_HISTORY = 8;
const MAX_MESSAGE_CHARS = 2000;

export function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => item.content.trim());
}

/**
 * Full help-chat pipeline (classification → retrieval → NVIDIA → safe response).
 */
export async function runHelpChat({
  message,
  history = [],
  role = null,
  page = null,
  userId = null,
  logFn = null,
} = {}) {
  const started = Date.now();
  const pageCtx = normalizePageContext(page);
  const classification = classifyQuestion(message, {
    role,
    pageTopic: pageCtx.topic,
  });

  if (classification.unsupported) {
    const payload = staticFallbackResponse({
      fallbackState: 'unsupported',
      topic: 'unknown',
      role,
      answer:
        'I only help with InternSafar (sign in, registration, internships, applications, messaging, and admin basics). Please ask a product question, or open Help Center / How it works.',
    });
    const eventId = await recordHelpChatEvent({
      userId,
      role,
      topic: 'unknown',
      fallbackState: 'unsupported',
      success: true,
      latencyMs: Date.now() - started,
      model: NVIDIA_MODEL,
      knowledgeIds: [],
      pathname: pageCtx.pathname,
      unanswered: true,
    });
    return {
      ...payload,
      suggestions: helpFollowUps({ role, topic: 'unknown', pathname: pageCtx.pathname }),
      eventId,
    };
  }

  const retrieved = retrieveKnowledge({
    topic: classification.topic,
    role,
    question: message,
  });

  if (!retrieved.factsText || classification.topic === 'unknown' && classification.score < 1) {
    // still try NVIDIA with troubleshooting facts if we have them
  }

  if (!retrieved.knowledgeIds.length) {
    const payload = staticFallbackResponse({
      fallbackState: 'insufficient_knowledge',
      topic: classification.topic,
      role,
      answer:
        'I do not have enough verified InternSafar information to answer that accurately. Please check Help Center or How it works.',
    });
    const eventId = await recordHelpChatEvent({
      userId,
      role,
      topic: classification.topic,
      fallbackState: 'insufficient_knowledge',
      success: true,
      latencyMs: Date.now() - started,
      model: NVIDIA_MODEL,
      knowledgeIds: [],
      pathname: pageCtx.pathname,
      unanswered: true,
    });
    return {
      ...payload,
      suggestions: helpFollowUps({
        role,
        topic: classification.topic,
        pathname: pageCtx.pathname,
      }),
      eventId,
    };
  }

  const actionIds = allowedActionIdsForPrompt(role);
  const systemPrompt = buildHelpSystemPrompt({
    role,
    page: pageCtx,
    knowledgeFacts: retrieved.factsText,
    actionIds,
  });

  const safeHistory = sanitizeHistory(history).filter((h) => h.role === 'user' || h.role === 'assistant');
  // Drop leading assistant welcome from history to save tokens if present alone before user
  const messages = [
    { role: 'system', content: systemPrompt },
    ...safeHistory.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: String(message).slice(0, MAX_MESSAGE_CHARS) },
  ];

  const { text } = await nvidiaChat(null, null, {
    messages,
    maxTokens: 280,
    temperature: 0.3,
    // Fail fast for UI: avoid multi-minute retry storms when NIM is down.
    maxKeyAttempts: 2,
    retriesPerKey: 1,
    requestTimeoutMs: 20_000,
    logFn,
  });

  const payload = normalizeHelpResponse({
    rawText: text,
    topic: classification.topic,
    role,
    fallbackState: 'answered',
    knowledgeIds: retrieved.knowledgeIds,
  });

  const eventId = await recordHelpChatEvent({
    userId,
    role,
    topic: classification.topic,
    fallbackState: 'answered',
    success: true,
    latencyMs: Date.now() - started,
    model: NVIDIA_MODEL,
    knowledgeIds: retrieved.knowledgeIds,
    pathname: pageCtx.pathname,
    unanswered: false,
  });

  return {
    ...payload,
    suggestions: helpFollowUps({
      role,
      topic: classification.topic,
      pathname: pageCtx.pathname,
    }),
    eventId,
  };
}

export { MAX_HISTORY, MAX_MESSAGE_CHARS };
