import { query } from '@/lib/db';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { hoursUntilClose, deriveLifecycleLabel } from '@/lib/ipInternshipVisibility';

/**
 * Optional employer reminders before posting goes live / before applications close.
 * Idempotent via remind_start_sent_at / remind_end_sent_at.
 */
export async function processScheduleReminders({ now = new Date() } = {}) {
  const sent = { start: 0, end: 0, errors: [] };

  // Before launch: published, starts_at in future, within remind_start_hours, not yet sent
  const startDue = await query(
    `SELECT i.id, i.title, i.starts_at, i.apply_ends_at, i.remind_start_hours,
            e.user_id, e.company_name, u.email
     FROM ip_internships i
     JOIN ip_employers e ON e.id = i.employer_id
     JOIN ip_users u ON u.id = e.user_id
     WHERE i.status = 'published'
       AND i.remind_before_start = true
       AND i.starts_at IS NOT NULL
       AND i.remind_start_sent_at IS NULL
       AND i.starts_at > $1::timestamptz
       AND i.starts_at <= ($1::timestamptz + make_interval(hours => GREATEST(i.remind_start_hours, 1)))`,
    [now.toISOString()],
  );

  for (const row of startDue.rows) {
    try {
      const when = new Date(row.starts_at).toLocaleString();
      const title = `Posting launches soon: ${row.title}`;
      const body = `Your posting goes live at ${when}. Review details before candidates can see it.`;
      await notifyUser({
        userId: row.user_id,
        title,
        body,
        link: `/employer/internships/${row.id}/edit`,
        category: 'system',
      });
      try {
        await sendMail({
          to: row.email,
          subject: title,
          text: body,
          html: `<p>${body}</p><p><a href="/employer/internships/${row.id}">Open posting</a></p>`,
        });
      } catch (e) {
        console.warn('[scheduleReminders] mail start', e.message);
      }
      await query(
        `UPDATE ip_internships SET remind_start_sent_at = now(), updated_at = now() WHERE id = $1`,
        [row.id],
      );
      sent.start += 1;
    } catch (e) {
      sent.errors.push({ id: row.id, phase: 'start', error: e.message });
    }
  }

  const endDue = await query(
    `SELECT i.id, i.title, i.starts_at, i.apply_ends_at, i.remind_end_hours,
            e.user_id, e.company_name, u.email
     FROM ip_internships i
     JOIN ip_employers e ON e.id = i.employer_id
     JOIN ip_users u ON u.id = e.user_id
     WHERE i.status = 'published'
       AND i.remind_before_end = true
       AND i.apply_ends_at IS NOT NULL
       AND i.remind_end_sent_at IS NULL
       AND i.apply_ends_at > $1::timestamptz
       AND i.apply_ends_at <= ($1::timestamptz + make_interval(hours => GREATEST(i.remind_end_hours, 1)))`,
    [now.toISOString()],
  );

  for (const row of endDue.rows) {
    try {
      const hoursLeft = hoursUntilClose(row, now);
      const when = new Date(row.apply_ends_at).toLocaleString();
      const title = `Applications closing soon: ${row.title}`;
      const body = `Applications close at ${when}${hoursLeft != null ? ` (~${hoursLeft}h left)` : ''}. Lifecycle: ${deriveLifecycleLabel(row, now)}.`;
      await notifyUser({
        userId: row.user_id,
        title,
        body,
        link: `/employer/internships/${row.id}`,
        category: 'system',
      });
      try {
        await sendMail({
          to: row.email,
          subject: title,
          text: body,
          html: `<p>${body}</p>`,
        });
      } catch (e) {
        console.warn('[scheduleReminders] mail end', e.message);
      }
      await query(
        `UPDATE ip_internships SET remind_end_sent_at = now(), updated_at = now() WHERE id = $1`,
        [row.id],
      );
      sent.end += 1;
    } catch (e) {
      sent.errors.push({ id: row.id, phase: 'end', error: e.message });
    }
  }

  return sent;
}
