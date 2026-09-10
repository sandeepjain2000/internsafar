import { NextResponse } from 'next/server';
import { nvidiaChat, nvidiaCredentialStatus } from '@/lib/nvidiaLlm';
import {
  INTERNSAFAR_HELP_SYSTEM_PROMPT,
  plainTextHelpReply,
} from '@/lib/ipHelpChatContext';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Allow NVIDIA NIM latency on Vercel (Hobby max often 60s). */
export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY = 8;

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((item) => item.content.trim());
}

export async function GET() {
  const status = nvidiaCredentialStatus();
  return NextResponse.json({
    ok: true,
    configured: status.envKeyConfigured || status.envKeysCount > 0 || status.localKeyFiles > 0,
    model: status.model,
    // Never expose key material — names/counts only.
    localKeyFiles: status.localKeyFiles,
    envKeyConfigured: status.envKeyConfigured,
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = String(body.message || body.question || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'Please enter a help question.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `Question is too long (max ${MAX_MESSAGE_CHARS} characters).` },
        { status: 400 },
      );
    }

    const history = sanitizeHistory(body.history);
    const historyBlock = history.length
      ? `\n\nRecent conversation:\n${history
          .map((h) => `${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.content}`)
          .join('\n')}`
      : '';

    const userPrompt = `${message}${historyBlock}`;

    const { text, keyId } = await nvidiaChat(userPrompt, INTERNSAFAR_HELP_SYSTEM_PROMPT, {
      maxTokens: 220,
      temperature: 0.3,
      maxKeyAttempts: 4,
      retriesPerKey: 3,
      logFn: (line) => console.info('[help-chat]', line),
    });

    return NextResponse.json({
      ok: true,
      reply: plainTextHelpReply(text),
      // keyId is filename / env label only — never the secret.
      keyId,
    });
  } catch (error) {
    console.error('[help-chat]', error.message);
    const status = Number(error?.status) || 502;
    return NextResponse.json(
      {
        error:
          status === 429
            ? 'Help chatbot is busy (rate limit). Wait a few seconds and try again.'
            : status === 401 || status === 403
              ? 'Help chatbot could not authenticate with NVIDIA. Check server credentials.'
              : 'Help chatbot is temporarily unavailable. Try again in a moment, or open /help.',
      },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }
}
