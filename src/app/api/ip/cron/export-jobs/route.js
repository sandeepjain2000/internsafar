import { jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processExportJob } from '@/lib/ipApplicantExport';
import { query } from '@/lib/db';
import { authorizeIpCron } from '@/lib/ipCronAuth';

/**
 * Drain pending/processing applicant export jobs.
 * Requires IP_CRON_SECRET / CRON_SECRET (fail closed — IP-SEC-004).
 */
export async function POST(request) {
  await ensureIpWorkbenchSchema();
  const authz = authorizeIpCron(request);
  if (!authz.ok) {
    return jsonError('Unauthorized cron', 401);
  }

  const pending = await query(
    `SELECT id FROM ip_export_jobs
     WHERE status IN ('pending', 'processing')
     ORDER BY created_at ASC
     LIMIT 20`,
  );

  const results = [];
  for (const row of pending.rows) {
    try {
      const job = await processExportJob(row.id);
      results.push({ id: row.id, status: job?.status || 'unknown' });
    } catch (e) {
      results.push({ id: row.id, status: 'failed', error: e.message });
    }
  }

  return jsonOk({ ok: true, processed: results.length, results });
}
