import { createHash } from 'crypto';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpAccountSettingsSchema();
  const body = await request.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return jsonError('Enter the 6-digit code');
  const hash = createHash('sha256').update(code).digest('hex');

  const found = await query(
    `SELECT * FROM ip_phone_change_challenges
     WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [session.user.id, hash],
  );
  const challenge = found.rows[0];
  if (!challenge) return jsonError('Code is invalid or expired', 400);

  const stored = `${challenge.new_country_code || ''} ${challenge.new_phone}`.replace(/\s+/g, ' ').trim();
  await query(
    `UPDATE ip_candidates
     SET phone = $2, phone_country_code = $3, phone_verified_at = now(), updated_at = now()
     WHERE user_id = $1`,
    [session.user.id, stored, challenge.new_country_code || '+91'],
  );
  await query(`UPDATE ip_phone_change_challenges SET used_at = now() WHERE id = $1`, [challenge.id]);

  return jsonOk({
    ok: true,
    phone: stored,
    phoneCountryCode: challenge.new_country_code || '+91',
    phoneVerifiedAt: new Date().toISOString(),
  });
}
