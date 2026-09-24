import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Shared cron authorization — fail closed.
 * Valid IP_CRON_SECRET or CRON_SECRET required; session alone is never enough.
 */
export function authorizeIpCron(request, opts = {}) {
  const readEnvFile = Boolean(opts.readEnvFile);
  let fileIp = '';
  let fileCron = '';
  if (readEnvFile && !process.env.VERCEL) {
    try {
      const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const s = line.trim();
        if (!s || s.startsWith('#') || !s.includes('=')) continue;
        const i = s.indexOf('=');
        const k = s.slice(0, i).trim();
        const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (k === 'IP_CRON_SECRET') fileIp = v;
        if (k === 'CRON_SECRET') fileCron = v;
      }
    } catch {
      /* ignore */
    }
  }

  const ipAlts = new Set(
    [process.env.IP_CRON_SECRET, fileIp].map((s) => String(s || '').trim()).filter(Boolean),
  );
  const cronAlts = new Set(
    [process.env.CRON_SECRET, fileCron].map((s) => String(s || '').trim()).filter(Boolean),
  );

  if (!ipAlts.size && !cronAlts.size) {
    return { ok: false, reason: 'cron_secret_unset' };
  }

  const headerSecret = request.headers.get('x-ip-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (headerSecret && (ipAlts.has(headerSecret) || cronAlts.has(headerSecret))) {
    return { ok: true, via: 'header' };
  }
  if (bearer && (ipAlts.has(bearer) || cronAlts.has(bearer))) {
    return { ok: true, via: 'bearer' };
  }
  return { ok: false, reason: 'bad_secret' };
}
