import { createHash } from 'crypto';
import { query, withClient } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { sendMail } from '@/lib/mail';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  await ensureIpAccountSettingsSchema();
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return jsonError('Enter the 6-digit code');
  const hash = createHash('sha256').update(code).digest('hex');

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
      await client.query(`UPDATE ip_candidates SET email = $2, updated_at = now() WHERE user_id = $1`, [session.user.id, challenge.new_email]);
      await client.query(`UPDATE ip_email_change_challenges SET used_at = now() WHERE id = $1`, [challenge.id]);
      await client.query(`DELETE FROM ip_auth_sessions WHERE user_id = $1`, [session.user.id]).catch(() => {});
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
      subject: 'Your PlacementHub login email changed',
      text: `Your login email was changed to ${changed.new_email}. Your old email can no longer be used to sign in.`,
      html: `<p>Your PlacementHub login email was changed to <strong>${changed.new_email}</strong>.</p><p>Your old email can no longer be used to sign in.</p>`,
    });
  } catch (mailError) {
    console.warn('[email change courtesy mail]', mailError.message);
  }
  return jsonOk({ ok: true, newEmail: changed.new_email });
}
