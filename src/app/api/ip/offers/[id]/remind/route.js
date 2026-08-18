import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { getNotifyChannels } from '@/lib/ipNotificationPreferences';
import { ensureIpOfferRemindSchema } from '@/lib/ensureIpOfferRemindSchema';

const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Employer-only: remind a candidate about a still-pending offer.
 * Circumstances: offer owned by employer, status pending, not past cooldown.
 */
export async function POST(_request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const { id } = await params;

  await ensureIpOfferRemindSchema();

  const emp = await query(`SELECT id, company_name FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);

  const offer = await query(
    `SELECT o.*, i.title, c.name as candidate_name, c.user_id as candidate_user_id
     FROM ip_offers o
     JOIN ip_internships i ON i.id = o.internship_id
     JOIN ip_candidates c ON c.id = o.candidate_id
     WHERE o.id = $1 AND o.employer_id = $2`,
    [id, emp.rows[0].id],
  );
  const row = offer.rows[0];
  if (!row) return jsonError('Offer not found', 404);

  if (row.status !== 'pending') {
    return jsonError(`Remind only applies to pending offers (current status: ${row.status})`, 400);
  }

  if (row.valid_until) {
    const until = new Date(row.valid_until);
    if (!Number.isNaN(until.getTime()) && until.getTime() < Date.now()) {
      return jsonError('This offer has expired — extend or send a new offer instead of reminding', 400);
    }
  }

  if (row.last_reminded_at) {
    const last = new Date(row.last_reminded_at).getTime();
    const remaining = REMIND_COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const hours = Math.ceil(remaining / (60 * 60 * 1000));
      return jsonError(`You already reminded this candidate recently. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`, 429);
    }
  }

  const roleLabel = row.role_title || row.title;
  const company = emp.rows[0].company_name || 'the employer';

  await notifyUser({
    userId: row.candidate_user_id,
    title: 'Reminder: offer awaiting your response',
    body: `${roleLabel} at ${company}`,
    link: '/candidate/offers',
    category: 'offer',
    skipEmail: true,
    meta: {
      kind: 'offer_remind',
      offerId: row.id,
      company,
      validUntil: row.valid_until || null,
      roleTitle: roleLabel,
    },
  });

  try {
    const channels = await getNotifyChannels(row.candidate_user_id, 'offer');
    const emailRow = await query(`SELECT email FROM ip_users WHERE id = $1`, [row.candidate_user_id]);
    const to = emailRow.rows[0]?.email;
    if (channels.email && to) {
      await sendMail({
        to,
        subject: `Reminder: offer for ${roleLabel}`,
        html: `<p>Hi ${row.candidate_name || 'there'},</p>
<p>${company} is reminding you that your internship offer for <strong>${roleLabel}</strong> is still awaiting your response.</p>
<p><a href="/candidate/offers">Review your offer</a> in Internship Portal to accept or decline.</p>`,
        text: `${company} is reminding you that your offer for ${roleLabel} is still awaiting your response. Sign in to Internship Portal → Offers to respond.`,
      });
    }
  } catch (e) {
    console.error('[offer remind] email failed', e.message);
  }

  const updated = await query(
    `UPDATE ip_offers SET last_reminded_at = now() WHERE id = $1 RETURNING last_reminded_at`,
    [id],
  );

  return jsonOk({
    ok: true,
    last_reminded_at: updated.rows[0]?.last_reminded_at || new Date().toISOString(),
  });
}
