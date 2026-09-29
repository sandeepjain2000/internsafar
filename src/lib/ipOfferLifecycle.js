import { query } from '@/lib/db';

/**
 * A pending offer only stays open while its application is 'offered'. When an employer moves the
 * application anywhere else, close the offer as 'withdrawn' so the candidate cannot accept over that
 * decision. Databases without migration 046 reject 'withdrawn' (check_violation), so fall back to 'expired'.
 */
export async function closePendingOfferForApplication(applicationId, nextApplicationStatus) {
  if (!applicationId || nextApplicationStatus === 'offered') return;
  try {
    await query(
      `UPDATE ip_offers SET status = 'withdrawn' WHERE application_id = $1 AND status = 'pending'`,
      [applicationId],
    );
  } catch (err) {
    if (err?.code !== '23514') throw err;
    await query(
      `UPDATE ip_offers SET status = 'expired' WHERE application_id = $1 AND status = 'pending'`,
      [applicationId],
    );
  }
}
