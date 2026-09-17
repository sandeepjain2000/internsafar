import { readFileSync } from 'fs';
import { join } from 'path';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { runDailyProgressReport } from '@/lib/ipDailyProgressReport';

/**
 * Compact daily progress report → Zepto → placementhubsupport@gmail.com
 *
 * Auth (any one):
 *   - x-ip-cron-secret === IP_CRON_SECRET (process env OR .env on disk for AWS)
 *   - Authorization: Bearer <IP_CRON_SECRET|CRON_SECRET>
 *   - else superadmin session (when no secrets configured)
 *
 * Query/body: force=1, dryRun=1
 * Subject/body time = real IST wall-clock at send (not a fake scheduled stamp).
 */
function secretsFromEnvFile() {
  if (process.env.VERCEL) return { ip: '', cron: '' };
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const out = { ip: '', cron: '' };
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith('#') || !s.includes('=')) continue;
      const i = s.indexOf('=');
      const k = s.slice(0, i).trim();
      const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (k === 'IP_CRON_SECRET') out.ip = v;
      if (k === 'CRON_SECRET') out.cron = v;
    }
    return out;
  } catch {
    return { ip: '', cron: '' };
  }
}

function authorizeCron(request) {
  const file = secretsFromEnvFile();
  const ipSecret = String(process.env.IP_CRON_SECRET || file.ip || '').trim();
  const vercelSecret = String(process.env.CRON_SECRET || file.cron || '').trim();
  const ipAlts = new Set(
    [process.env.IP_CRON_SECRET, file.ip].map((s) => String(s || '').trim()).filter(Boolean),
  );
  const cronAlts = new Set(
    [process.env.CRON_SECRET, file.cron].map((s) => String(s || '').trim()).filter(Boolean),
  );
  const headerSecret = request.headers.get('x-ip-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (ipAlts.size || cronAlts.size || ipSecret || vercelSecret) {
    if (headerSecret && ipAlts.has(headerSecret)) return { ok: true };
    if (bearer && (ipAlts.has(bearer) || cronAlts.has(bearer))) return { ok: true };
    if (ipSecret && headerSecret === ipSecret) return { ok: true };
    if (ipSecret && bearer === ipSecret) return { ok: true };
    if (vercelSecret && bearer === vercelSecret) return { ok: true };
    return { ok: false };
  }
  return { ok: null };
}

async function handle(request) {
  const authz = authorizeCron(request);
  if (authz.ok === false) {
    return jsonError('Unauthorized cron', 401);
  }
  if (authz.ok === null) {
    const { error } = await requireSession(['superadmin']);
    if (error) return error;
  }

  const url = new URL(request.url);
  let body = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  const force =
    url.searchParams.get('force') === '1' ||
    body.force === true ||
    body.force === 1 ||
    body.force === '1';
  const dryRun =
    url.searchParams.get('dryRun') === '1' ||
    body.dryRun === true ||
    body.dryRun === 1 ||
    body.dryRun === '1';

  try {
    const result = await runDailyProgressReport({ force, dryRun });
    if (result.skipped) {
      return jsonOk(result, 200);
    }
    return jsonOk(result);
  } catch (e) {
    console.error('[daily-progress-report]', e);
    return jsonError(e.message || 'Daily progress report failed', 500);
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
