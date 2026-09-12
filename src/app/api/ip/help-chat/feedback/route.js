import { NextResponse } from 'next/server';
import { recordHelpChatFeedback } from '@/lib/ipHelpChat/analytics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REASONS = new Set([
  'Did not answer my question',
  'Information seems incorrect',
  'Need more detail',
  'Other',
]);

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const eventId = String(body.eventId || '').trim();
  const feedback = String(body.feedback || '').trim().toLowerCase();
  const reasonRaw = String(body.reason || '').trim();
  const reason = REASONS.has(reasonRaw) ? reasonRaw : reasonRaw ? 'Other' : null;

  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }
  if (feedback !== 'helpful' && feedback !== 'not_helpful') {
    return NextResponse.json({ error: 'feedback must be helpful or not_helpful' }, { status: 400 });
  }

  const ok = await recordHelpChatFeedback({
    eventId,
    feedback,
    reason: feedback === 'not_helpful' ? reason : null,
  });

  return NextResponse.json({ ok: true, recorded: ok });
}
