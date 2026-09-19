/**
 * InternSafar ops failure email (lean).
 * To: IP_OPS_ALERT_EMAIL or placementhubsupport@gmail.com
 * Not for validation / 429 / single-key flaky NIM timeouts.
 * QA probes on local/Vercel: accepted by API, no inbox mail.
 */
import { sendMail } from '@/lib/mail';
import { newId } from '@/lib/ids';

export const OPS_ALERT_TO =
  String(process.env.IP_OPS_ALERT_EMAIL || 'placementhubsupport@gmail.com')
    .trim()
    .toLowerCase() || 'placementhubsupport@gmail.com';

const COOLDOWN_MS = Math.max(
  60_000,
  Number(process.env.IP_OPS_ALERT_COOLDOWN_MS) || 30 * 60_000,
);

/** @type {Map<string, number>} */
const lastSentAt = new Map();

const REDACT_KEY = /(password|secret|token|authorization|cookie|api[_-]?key)/i;

function hostLabel() {
  if (process.env.VERCEL) return 'vercel';
  const url = String(process.env.NEXTAUTH_URL || '').toLowerCase();
  if (url.includes('internsafar.com')) return 'aws';
  if (url.includes('localhost')) return 'local';
  return process.env.NODE_ENV || 'unknown';
}

function truncate(s, max = 1500) {
  const t = String(s || '');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function redactDetails(details) {
  if (details == null) return null;
  if (typeof details !== 'object') return truncate(details, 800);
  const out = {};
  for (const [k, v] of Object.entries(details)) {
    out[k] = REDACT_KEY.test(k) ? '[redacted]' : truncate(v, 500);
  }
  return out;
}

function fingerprint({ kind, message, route }) {
  return `${kind}|${String(route || '')}|${String(message || '').slice(0, 120)}`;
}

/**
 * Fire-and-forget. Never throws to callers.
 * @param {{
 *   kind: string;
 *   message: string;
 *   route?: string | null;
 *   statusCode?: number | null;
 *   stack?: string | null;
 *   details?: Record<string, unknown> | null;
 *   force?: boolean;
 * }} payload
 */
export async function reportOpsFailure(payload) {
  try {
    const kind = String(payload.kind || 'UNEXPECTED').slice(0, 64);
    const message = truncate(payload.message || 'Unknown failure', 2000);
    const route = truncate(payload.route || '', 300);
    const fp = fingerprint({ kind, message, route });
    const now = Date.now();
    if (!payload.force) {
      const prev = lastSentAt.get(fp) || 0;
      if (now - prev < COOLDOWN_MS) return { sent: false, reason: 'cooldown' };
    }
    lastSentAt.set(fp, now);

    const ref = newId('ip_ops');
    const host = hostLabel();
    // QA suites intentionally POST synthetic probes. API still accepts them so
    // regression stays green; local + Vercel must not email placementhubsupport.
    const isQaProbe =
      kind === 'QA_PROBE' ||
      /^QA\b/i.test(message) ||
      String(route || '').startsWith('/qa/');
    if (isQaProbe && (host === 'local' || host === 'vercel')) {
      console.info('[ipOpsAlert] QA probe accepted without mail', { host, kind, ref, route });
      return { sent: false, reason: 'qa_probe_no_mail', ref, host };
    }
    const subject = isQaProbe
      ? `[InternSafar][QA-PROBE][${kind}] ${truncate(message, 80)}`
      : `[InternSafar][FAILURE][${kind}] ${truncate(message, 80)}`;
    const details = redactDetails(payload.details);
    const text = [
      isQaProbe
        ? 'InternSafar QA probe — intentional test of ops mail (not a real user failure)'
        : 'InternSafar ops alert',
      `Reference: ${ref}`,
      `Host: ${host}`,
      `Kind: ${kind}`,
      `When: ${new Date(now).toISOString()}`,
      `Route: ${route || '(n/a)'}`,
      `Status: ${payload.statusCode ?? '(n/a)'}`,
      `Message: ${message}`,
      payload.stack ? `Stack:\n${truncate(payload.stack, 2500)}` : '',
      details ? `Details:\n${JSON.stringify(details, null, 2)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const html = `<pre style="font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap">${text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')}</pre>`;

    await sendMail({ to: OPS_ALERT_TO, subject, text, html });
    return { sent: true, ref };
  } catch (e) {
    console.error('[ipOpsAlert] send failed', e.message);
    return { sent: false, reason: e.message };
  }
}

/** Non-blocking wrapper for route handlers / clients. */
export function reportOpsFailureBackground(payload) {
  void reportOpsFailure(payload);
}
