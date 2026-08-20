import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processScheduleReminders } from '@/lib/ipScheduleReminders';

/**
 * Process due posting launch/close reminders.
 * Employer or SuperAdmin can trigger; also callable from CLI script.
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

  const result = await processScheduleReminders();
  return jsonOk({ ok: true, ...result });
}
