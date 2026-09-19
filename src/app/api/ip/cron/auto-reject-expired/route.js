import { jsonError, jsonOk, requireSession } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processAutoRejectExpiredApplications } from '@/lib/ipAutoRejectExpiredApplications';

/**
 * Auto-reject non-shortlisted applicants after apply_ends_at.
 *
 * Triggers (local / Vercel now):
 * - Vercel Cron GET (see vercel.json) with Authorization: Bearer CRON_SECRET
 * - Local/ops: POST with x-ip-cron-secret: IP_CRON_SECRET (npm run cron:auto-reject-expired)
 * - Backup: employer dashboard still runs a small scoped pass for that employer
 *
 * Load: capped batch (default ≤100 expired internships × ≤100 applied/pending each).
 * Idempotent — already-rejected rows are skipped. Safe for 1×/day on Hobby.
 *
 * AWS (future): when Path B/EC2 deploy is used, add a system crontab (or reuse the
 * AWS clock that already curls Vercel crons) to hit this same path on a schedule.
 * Do not rely on employer login. Prefer IP_CRON_SECRET header like other IP crons.
 * Example (IST-friendly UTC): 0 3 * * * curl -X POST -H "x-ip-cron-secret: …" …/api/ip/cron/auto-reject-expired
 */

function authorizeCron(request) {
  const ipSecret = String(process.env.IP_CRON_SECRET || '').trim();
  const vercelSecret = String(process.env.CRON_SECRET || '').trim();
  const headerSecret = request.headers.get('x-ip-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';

  if (ipSecret || vercelSecret) {
    if (headerSecret && (headerSecret === ipSecret || headerSecret === vercelSecret)) {
      return { ok: true, via: 'header' };
    }
    if (bearer && (bearer === ipSecret || bearer === vercelSecret)) {
      return { ok: true, via: 'bearer' };
    }
    return { ok: false };
  }
  return { ok: null }; // no secrets configured — fall through to session
}

async function run(request) {
  await ensureIpWorkbenchSchema();

  const authz = authorizeCron(request);
  if (authz.ok === false) {
    return jsonError('Unauthorized cron', 401);
  }
  if (authz.ok === null) {
    const { error } = await requireSession(['employer', 'superadmin']);
    if (error) return error;
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

  // Keep batch small so Vercel/local cron never floods DB or mail.
  const result = await processAutoRejectExpiredApplications({
    employerId,
    limit: employerId ? 50 : 100,
  });
  return jsonOk(result);
}

/** Vercel Cron invokes GET. */
export async function GET(request) {
  return run(request);
}

/** Local scripts / AWS curl use POST. */
export async function POST(request) {
  return run(request);
}
