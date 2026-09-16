import { NextResponse } from 'next/server';
import { reportOpsFailure } from '@/lib/ipOpsAlert';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const IGNORE = [
  /^ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Loading CSS chunk/i,
  /Loading chunk [\d]+ failed/i,
  /hydrat/i,
  // CefSharp / Outlook Safe Links / embedded Chromium crawlers — not our app.
  /^Object Not Found Matching Id:\d+, MethodName:update, ParamCount:\d+$/i,
];

/**
 * Client / boundary unexpected errors → ops email (debounced).
 * Not for normal validation UX.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || body.error || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }
  if (IGNORE.some((re) => re.test(message))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await reportOpsFailure({
    kind: String(body.kind || 'UNEXPECTED_CLIENT').slice(0, 64),
    message,
    route: String(body.route || body.source || '').slice(0, 300),
    statusCode: body.statusCode != null ? Number(body.statusCode) : null,
    stack: body.stack ? String(body.stack).slice(0, 2500) : null,
    details: {
      source: body.source || null,
      href: body.href ? String(body.href).slice(0, 300) : null,
      userAgent: request.headers.get('user-agent')?.slice(0, 200) || null,
    },
  });

  return NextResponse.json({ ok: true, ...result });
}
