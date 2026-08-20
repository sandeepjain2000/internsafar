import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processExportJob } from '@/lib/ipApplicantExport';

/**
 * Drain pending/processing applicant export jobs.
 * Optional header x-ip-cron-secret must match IP_CRON_SECRET when set.
 */
export async function POST(request) {
  await ensureIpWorkbenchSchema();
  const cronSecret = process.env.IP_CRON_SECRET;
  const headerSecret = request.headers.get('x-ip-cron-secret') || '';
  if (cronSecret) {
    if (headerSecret !== cronSecret) {
      return jsonError('Unauthorized cron', 401);
    }
  } else {
    const { error } = await requireSession(['employer', 'superadmin']);
    if (error) return error;
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
