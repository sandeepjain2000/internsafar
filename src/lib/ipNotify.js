import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';
import { getNotifyChannels } from '@/lib/ipNotificationPreferences';
import { sendMail } from '@/lib/mail';

/**
 * Insert a notification for one ip_users row.
 * category: 'application' | 'referral' | 'system' | 'offer' | 'interview' | 'message'
 * Honors candidate delivery preferences for application/interview/offer/message.
 * Never throws — callers should fire-and-forget.
 *
 * skipEmail: caller will send a richer email if the email channel is on.
 */
const NOTIFY_CATEGORIES = ['application', 'referral', 'system', 'offer', 'interview', 'message'];

export async function notifyUser({
  userId,
  title,
  body = '',
  link = '#',
  category = 'system',
  meta = {},
  client,
  skipEmail = false,
}) {
  if (!userId || !title) return null;
  const cat = NOTIFY_CATEGORIES.includes(category) ? category : 'system';
  let channels = { inApp: true, email: false, sms: false };
  try {
    if (!client) channels = await getNotifyChannels(userId, cat);
  } catch (e) {
    console.warn('[ipNotify prefs]', e.message);
  }

  let id = null;
  if (channels.inApp) {
    id = newId('ip_notif');
    const metaJson = JSON.stringify(meta && typeof meta === 'object' ? meta : {});
    const sql = `INSERT INTO ip_notifications (id, user_id, title, body, link, category, meta) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`;
    const params = [id, userId, title, body, link, cat, metaJson];
    try {
      if (!client) await ensureIpNotificationCategorySchema();
      if (client) await client.query(sql, params);
      else await query(sql, params);
    } catch (e) {
      try {
        const withCat = `INSERT INTO ip_notifications (id, user_id, title, body, link, category) VALUES ($1,$2,$3,$4,$5,$6)`;
        if (client) await client.query(withCat, [id, userId, title, body, link, cat]);
        else await query(withCat, [id, userId, title, body, link, cat]);
      } catch (e2) {
        try {
          const fallback = `INSERT INTO ip_notifications (id, user_id, title, body, link) VALUES ($1,$2,$3,$4,$5)`;
          const fbParams = [id, userId, title, body, link];
          if (client) await client.query(fallback, fbParams);
          else await query(fallback, fbParams);
        } catch (e3) {
          console.error('[ipNotify]', e3.message || e2.message || e.message);
          id = null;
        }
      }
    }
  }

  if (channels.email && !skipEmail && !client) {
    try {
      const user = await query(`SELECT email, name FROM ip_users WHERE id = $1`, [userId]);
      const to = user.rows[0]?.email;
      if (to) {
        const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const href = link && link !== '#' ? `${origin}${link.startsWith('/') ? link : `/${link}`}` : origin;
        await sendMail({
          to,
          subject: title,
          html: `<p>Hi ${user.rows[0]?.name || 'there'},</p><p>${body || title}</p><p><a href="${href}">Open in Internship Portal</a></p>`,
          text: `${body || title}\n${href}`,
        });
      }
    } catch (e) {
      console.warn('[ipNotify email]', e.message);
    }
  }

  if (channels.sms) {
    console.info('[ipNotify] SMS preference on but no SMS carrier is configured — skipped for', userId, cat);
  }

  return id;
}

export async function notifyRole({ role, title, body = '', link = '#', category = 'system' }) {
  try {
    const users = await query(`SELECT id FROM ip_users WHERE role = $1 AND active = true`, [role]);
    await Promise.all(users.rows.map((u) => notifyUser({ userId: u.id, title, body, link, category })));
  } catch (e) {
    console.error('[ipNotify role]', e.message);
  }
}

export async function awardPoints({ userId, delta, reason, meta = {}, client }) {
  const runner = client || { query };
  await runner.query(`UPDATE ip_users SET points = points + $2 WHERE id = $1`, [userId, delta]);
  await runner.query(
    `INSERT INTO ip_points_ledger (id, user_id, delta, reason, meta) VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [newId('ip_pts'), userId, delta, reason, JSON.stringify(meta || {})],
  );
}
