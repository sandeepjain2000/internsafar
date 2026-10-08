import { jsonError, jsonOk } from '@/lib/apiAuth';
import { authorizeIpCron } from '@/lib/ipCronAuth';
import { runEmployerDocsReminders } from '@/lib/ipEmployerDocsReminder';

/**
 * Weekly "upload your documents" reminder for pending employers with no active document.
 * Scheduled on the AWS EC2 crontab only (Monday 10:00 IST); there is no SuperAdmin button.
 * Requires IP_CRON_SECRET / CRON_SECRET (fail closed — IP-SEC-004).
 *
 * Options (query string or JSON body): dryRun=1 lists who is due without sending;
 * employerId=<id>&force=1 sends to that one employer even when the env switch is off (testing).
 */
function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

async function handle(request) {
  const authz = authorizeIpCron(request, { readEnvFile: true });
  if (!authz.ok) {
    return jsonError('Unauthorized cron', 401);
  }

  const url = new URL(request.url);
  let body = {};
  if (request.method === 'POST') {
    body = await request.json().catch(() => ({}));
  }
  const dryRun = flag(url.searchParams.get('dryRun')) || flag(body.dryRun);
  const force = flag(url.searchParams.get('force')) || flag(body.force);
  const employerId = url.searchParams.get('employerId') || body.employerId || null;

  try {
    const result = await runEmployerDocsReminders({ dryRun, force, employerId });
    if (!result.ok) return jsonError(result.error || 'Employer docs reminder failed', 400);
    return jsonOk(result);
  } catch (e) {
    console.error('[employer-docs-reminder]', e);
    return jsonError(e.message || 'Employer docs reminder failed', 500);
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
