import { query } from '@/lib/db';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

export const NOTIFY_PREF_CATEGORIES = [
  {
    id: 'application',
    label: 'Application Status & Shortlist Alerts',
    hint: 'Updates when an employer shortlists, reviews, or updates your application status.',
    smsLabel: 'SMS',
    defaults: { in_app: true, email: true, sms: false },
  },
  {
    id: 'interview',
    label: 'Interview Invitations & Reminders',
    hint: 'Time-sensitive schedule invites and interview reminders.',
    smsLabel: 'SMS / WhatsApp',
    defaults: { in_app: true, email: true, sms: true },
  },
  {
    id: 'offer',
    label: 'Formal Offer Extensions',
    hint: 'Official offer notices and deadline warnings.',
    smsLabel: 'SMS',
    defaults: { in_app: true, email: true, sms: true },
  },
  {
    id: 'message',
    label: 'Direct Recruiter Messages',
    hint: 'Chat messages sent by recruiters from employer conversations.',
    smsLabel: 'SMS',
    defaults: { in_app: true, email: true, sms: false },
  },
];

const PREF_IDS = new Set(NOTIFY_PREF_CATEGORIES.map((c) => c.id));

function defaultsFor(category) {
  const spec = NOTIFY_PREF_CATEGORIES.find((c) => c.id === category);
  return spec ? { ...spec.defaults } : { in_app: true, email: false, sms: false };
}

export async function listNotificationPreferences(userId) {
  await ensureIpAccountSettingsSchema();
  const rows = await query(
    `SELECT category, in_app, email, sms FROM ip_notification_preferences WHERE user_id = $1`,
    [userId],
  );
  const byCat = new Map(rows.rows.map((r) => [r.category, r]));
  return NOTIFY_PREF_CATEGORIES.map((spec) => {
    const row = byCat.get(spec.id);
    return {
      id: spec.id,
      label: spec.label,
      hint: spec.hint,
      smsLabel: spec.smsLabel,
      in_app: row ? Boolean(row.in_app) : spec.defaults.in_app,
      email: row ? Boolean(row.email) : spec.defaults.email,
      sms: row ? Boolean(row.sms) : spec.defaults.sms,
    };
  });
}

export async function saveNotificationPreferences(userId, items) {
  await ensureIpAccountSettingsSchema();
  const incoming = Array.isArray(items) ? items : [];
  for (const spec of NOTIFY_PREF_CATEGORIES) {
    const row = incoming.find((i) => i && i.id === spec.id) || {};
    const inApp = row.in_app !== false;
    const email = row.email !== false;
    const sms = row.sms === true;
    await query(
      `INSERT INTO ip_notification_preferences (user_id, category, in_app, email, sms, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (user_id, category)
       DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, sms = EXCLUDED.sms, updated_at = now()`,
      [userId, spec.id, inApp, email, sms],
    );
  }
  return listNotificationPreferences(userId);
}

/** Channels for one notify category. Unlisted categories stay in-app only (no marketing email). */
export async function getNotifyChannels(userId, category) {
  const cat = String(category || 'system');
  if (!PREF_IDS.has(cat)) return { inApp: true, email: false, sms: false };
  await ensureIpAccountSettingsSchema();
  const row = await query(
    `SELECT in_app, email, sms FROM ip_notification_preferences WHERE user_id = $1 AND category = $2`,
    [userId, cat],
  );
  const found = row.rows[0];
  if (!found) {
    const d = defaultsFor(cat);
    return { inApp: d.in_app, email: d.email, sms: d.sms };
  }
  return {
    inApp: found.in_app !== false,
    email: found.email !== false,
    sms: found.sms === true,
  };
}
