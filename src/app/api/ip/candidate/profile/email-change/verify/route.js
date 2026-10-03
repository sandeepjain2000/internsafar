import { createHash } from 'crypto';
import { query, withClient } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { sendMail } from '@/lib/mail';
import { escapeHtml } from '@/lib/escapeHtml';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

/** Confirm login-email change for Account page (candidate + employer). */
export async function POST(request) {
  const { session, error } = await requireSession(['candidate', 'employer']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  await ensureIpAccountSettingsSchema();
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return jsonError('Enter the 6-digit code');
  const hash = createHash('sha256').update(code).digest('hex');
  const role = session.user.role;

  const changed = await withClient(async (client) => {
    await client.query('BEGIN');
    try {
      const found = await client.query(
        `SELECT * FROM ip_email_change_challenges
         WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [session.user.id, hash],
      );
      const challenge = found.rows[0];
      if (!challenge) {
        await client.query('ROLLBACK');
        return null;
      }
      await client.query(
        `UPDATE ip_users SET email = $2, email_verified_at = now(), updated_at = now() WHERE id = $1`,
        [session.user.id, challenge.new_email],
      );
      if (role === 'candidate') {
        await client.query(
          `UPDATE ip_candidates SET email = $2, updated_at = now() WHERE user_id = $1`,
          [session.user.id, challenge.new_email],
        );
      }
      await client.query(`UPDATE ip_email_change_challenges SET used_at = now() WHERE id = $1`, [challenge.id]);
      await client.query('SAVEPOINT revoke_sessions');
      try {
        await client.query(
          `UPDATE ip_auth_sessions SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL AND id IS DISTINCT FROM $2`,
          [session.user.id, session.user.sessionId || null],
        );
      } catch (revokeErr) {
        await client.query('ROLLBACK TO SAVEPOINT revoke_sessions');
        console.warn('[email change] session revoke skipped', revokeErr.message);
      }
      await client.query('COMMIT');
      return challenge;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  });
  if (!changed) return jsonError('Code is invalid or expired', 400);

  try {
    await sendMail({
      to: changed.old_email,
      subject: 'Your InternSafar login email changed',
      text: `Your login email was changed to ${changed.new_email}. Your old email can no longer be used to sign in.`,
      html: `<p>Your InternSafar login email was changed to <strong>${escapeHtml(changed.new_email)}</strong>.</p><p>Your old email can no longer be used to sign in.</p>`,
      skipUnsubscribe: true,
    });
  } catch (mailError) {
    console.warn('[email change courtesy mail]', mailError.message);
  }
  return jsonOk({ ok: true, newEmail: changed.new_email });
}
