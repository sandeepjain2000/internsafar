import { jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processAutoRejectExpiredApplications } from '@/lib/ipAutoRejectExpiredApplications';
import { authorizeIpCron } from '@/lib/ipCronAuth';

/**
 * Auto-reject non-shortlisted applicants after apply_ends_at.
 *
 * Triggers:
 * - Vercel Cron GET with Authorization: Bearer CRON_SECRET
 * - Local/ops: POST with x-ip-cron-secret: IP_CRON_SECRET
 *
 * Fail closed: no configured secret and no matching secret → 401.
 * Employer/SuperAdmin session alone is never enough (IP-SEC-004).
 * Per-employer backup still runs from /api/ip/employer/dashboard (scoped).
 */

async function run(request) {
  await ensureIpWorkbenchSchema();

  const authz = authorizeIpCron(request);
  if (!authz.ok) {
    return jsonError('Unauthorized cron', 401);
  }

  let employerId;
  try {
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      employerId = body?.employerId || undefined;
    }
  } catch {
    employerId = undefined;
  }

  const result = await processAutoRejectExpiredApplications({
    employerId,
    limit: employerId ? 50 : 100,
  });
  return jsonOk(result);
}

export async function GET(request) {
  return run(request);
}

export async function POST(request) {
  return run(request);
}
