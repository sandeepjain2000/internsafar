import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { runDailyProgressReport } from '@/lib/ipDailyProgressReport';

/**
 * Compact daily progress report → Zepto → placementhubsupport@gmail.com
 * Candidates + employers (primary), postings + applications (secondary).
 *
 * Auth (any one):
 *   - x-ip-cron-secret === IP_CRON_SECRET
 *   - Authorization: Bearer <IP_CRON_SECRET|CRON_SECRET>  (Vercel Cron)
 *   - else superadmin session (when no secrets configured)
 *
 * Vercel Cron uses GET at 15:30 UTC (= 21:00 IST). AWS crontab uses POST via npm CLI.
 * Query: force=1, dryRun=1
 */
function authorizeCron(request) {
  const ipSecret = String(process.env.IP_CRON_SECRET || '').trim();
  const vercelSecret = String(process.env.CRON_SECRET || '').trim();
  const headerSecret = request.headers.get('x-ip-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (ipSecret || vercelSecret) {
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
