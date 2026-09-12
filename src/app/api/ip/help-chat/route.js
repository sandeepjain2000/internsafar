import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { headers } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { nvidiaCredentialStatus } from '@/lib/nvidiaLlm';
import { runHelpChat, MAX_MESSAGE_CHARS, sanitizeHistory } from '@/lib/ipHelpChat/runHelpChat';
import { checkHelpChatRateLimit } from '@/lib/ipHelpChat/rateLimit';
import { staticFallbackResponse } from '@/lib/ipHelpChat/responseSchema';
import { recordHelpChatEvent } from '@/lib/ipHelpChat/analytics';
import { NVIDIA_MODEL } from '@/lib/nvidiaLlm';
import { helpFollowUps } from '@/lib/ipHelpChat/suggestions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/** Allow NVIDIA NIM latency on Vercel (Hobby max often 60s). */
export const maxDuration = 60;

async function clientKey(userId) {
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for') || '';
    const ip = (fwd.split(',')[0] || h.get('x-real-ip') || 'unknown').trim();
    return userId ? `u:${userId}` : `ip:${ip}`;
  } catch {
    return userId ? `u:${userId}` : 'ip:unknown';
  }
}

export async function GET() {
  const status = nvidiaCredentialStatus();
  return NextResponse.json({
    ok: true,
    configured: status.envKeyConfigured || status.envKeysCount > 0 || status.localKeyFiles > 0,
    model: status.model,
    localKeyFiles: status.localKeyFiles,
    envKeyConfigured: status.envKeyConfigured,
  });
}

export async function POST(request) {
  const started = Date.now();
  let role = null;
  let userId = null;
  try {
    const session = await getServerSession(authOptions);
    role = session?.user?.role || null;
    userId = session?.user?.id || null;

    const limit = checkHelpChatRateLimit(await clientKey(userId), {
      limit: userId ? 30 : 15,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return NextResponse.json(
        {
          error: `Help chatbot rate limit reached. Try again in about ${limit.retryAfterSec} seconds.`,
          fallbackState: 'service_unavailable',
        },
        { status: 429 },
      );
    }

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
    const result = await runHelpChat({
      message,
      history,
      role,
      page: body.page || null,
      userId,
      logFn: (line) => console.info('[help-chat]', line),
    });

    // Do not expose NVIDIA keyId / internal credential labels to the browser.
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      answer: result.answer,
      actions: result.actions || [],
      relatedResources: result.relatedResources || [],
      fallbackState: result.fallbackState,
      topic: result.topic,
      suggestions: result.suggestions || [],
      eventId: result.eventId || null,
      knowledgeIds: result.knowledgeIds || [],
    });
  } catch (error) {
    console.error('[help-chat]', error.message);
    const status = Number(error?.status) || 502;
    const msg = String(error?.message || '');
    // Unexpected AI hard-fail only: auth/config — not 429 / flaky timeouts (NVIDIA probe handles all-keys-dead).
    if (status === 401 || status === 403 || /no nvidia credentials/i.test(msg)) {
      const { reportOpsFailureBackground } = await import('@/lib/ipOpsAlert');
      reportOpsFailureBackground({
        kind: status === 401 || status === 403 ? 'AI_AUTH_FAILURE' : 'NVIDIA_NO_CREDENTIALS',
        message: msg || 'Help chatbot AI provider failure',
        route: '/api/ip/help-chat',
        statusCode: status,
        stack: error?.stack || null,
      });
    }
    const unavailable = staticFallbackResponse({
      fallbackState: 'service_unavailable',
      topic: 'troubleshooting',
      role,
      answer:
        status === 429
          ? 'Help chatbot is busy (rate limit). Wait a few seconds and try again.'
          : status === 401 || status === 403
            ? 'Help chatbot could not authenticate with the AI provider. Try again later, or open Help Center.'
            : 'Help chatbot is temporarily unavailable. Try again in a moment, or open Help Center / How it works.',
    });
    await recordHelpChatEvent({
      userId,
      role,
      topic: 'troubleshooting',
      fallbackState: 'service_unavailable',
      success: false,
      latencyMs: Date.now() - started,
      model: NVIDIA_MODEL,
      knowledgeIds: [],
      unanswered: true,
    });
    return NextResponse.json(
      {
        ...unavailable,
        error: unavailable.reply,
        suggestions: helpFollowUps({ role, topic: 'troubleshooting' }),
      },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }
}
