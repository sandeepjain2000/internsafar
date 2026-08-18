import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { shouldShowProfileReminder } from '@/lib/profileReminder';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;

  const user = await query(
    `SELECT profile_complete, profile_reminder_last_shown_at, profile_reminder_last_login_count
     FROM ip_users WHERE id = $1`,
    [session.user.id],
  );
  const row = user.rows[0];
  if (!row) return jsonError('User not found', 404);

  const logins = await query(
    `SELECT count(*)::int AS n FROM ip_login_events WHERE user_id = $1 AND success = true`,
    [session.user.id],
  );
  const loginCount = logins.rows[0]?.n || 0;
  const decision = shouldShowProfileReminder({
    profileComplete: Boolean(row.profile_complete),
    loginCount,
    lastShownAt: row.profile_reminder_last_shown_at,
    lastShownLoginCount: row.profile_reminder_last_login_count,
  });

  const profileHref = session.user.role === 'employer' ? '/employer/profile' : '/candidate/profile';
  return jsonOk({
    shouldShow: decision.show,
    reason: decision.reason,
    loginCount,
    profileHref,
    profileComplete: Boolean(row.profile_complete),
  });
}

/** Mark reminder as shown / dismissed for this cycle. */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* empty ok */
  }
  const action = String(body.action || 'dismiss');
  if (!['dismiss', 'shown'].includes(action)) return jsonError('action must be dismiss|shown');

  const logins = await query(
    `SELECT count(*)::int AS n FROM ip_login_events WHERE user_id = $1 AND success = true`,
    [session.user.id],
  );
  const loginCount = logins.rows[0]?.n || 0;

  await query(
    `UPDATE ip_users
     SET profile_reminder_last_shown_at = now(),
         profile_reminder_last_login_count = $2,
         updated_at = now()
     WHERE id = $1`,
    [session.user.id, loginCount],
  );
  return jsonOk({ ok: true, loginCount });
}
