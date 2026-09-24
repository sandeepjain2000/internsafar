import { jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { processScheduleReminders } from '@/lib/ipScheduleReminders';
import { authorizeIpCron } from '@/lib/ipCronAuth';

/**
 * Process due posting launch/close reminders.
 * Requires IP_CRON_SECRET / CRON_SECRET (fail closed — IP-SEC-004).
 */
export async function POST(request) {
  await ensureIpWorkbenchSchema();
  const authz = authorizeIpCron(request);
  if (!authz.ok) {
    return jsonError('Unauthorized cron', 401);
  }

  const result = await processScheduleReminders();
  return jsonOk({ ok: true, ...result });
}
