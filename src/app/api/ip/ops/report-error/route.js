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
  // Empty/truncated bodies during deploy cutovers — not actionable ops mail.
  /Failed to execute ['"]json['"] on ['"]Response['"]/i,
  /Unexpected end of JSON input/i,
];

const IP_WINDOW_MS = 10 * 60_000;
const IP_MAX_REPORTS = 20;
const MAX_TRACKED_IPS = 2000;
/** Per-instance, per-IP report counter (public endpoint). */
const reportsByIp = new Map();

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

function overIpLimit(ip) {
  const now = Date.now();
  const entry = reportsByIp.get(ip);
  if (!entry || now - entry.start > IP_WINDOW_MS) {
    if (reportsByIp.size >= MAX_TRACKED_IPS) {
      for (const [key, value] of reportsByIp) {
        if (now - value.start > IP_WINDOW_MS) reportsByIp.delete(key);
      }
      if (reportsByIp.size >= MAX_TRACKED_IPS) reportsByIp.clear();
    }
    reportsByIp.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > IP_MAX_REPORTS;
}

/**
 * Client / boundary unexpected errors → ops email (debounced).
 * Not for normal validation UX.
 */
export async function POST(request) {
  if (overIpLimit(clientIp(request))) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'rate_limited' }, { status: 429 });
  }
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
