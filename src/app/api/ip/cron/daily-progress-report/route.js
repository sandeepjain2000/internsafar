import { jsonError, jsonOk } from '@/lib/apiAuth';
import { runDailyProgressReport } from '@/lib/ipDailyProgressReport';
import { authorizeIpCron } from '@/lib/ipCronAuth';

/**
 * Compact daily progress report → Zepto
 * Requires IP_CRON_SECRET / CRON_SECRET (fail closed — IP-SEC-004).
 * Also accepts secrets from on-disk .env for AWS hosts (readEnvFile).
 */
async function handle(request) {
  const authz = authorizeIpCron(request, { readEnvFile: true });
  if (!authz.ok) {
    return jsonError('Unauthorized cron', 401);
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
