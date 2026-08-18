import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { query } from '@/lib/db';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

export async function GET() {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  await ensureIpAccountSettingsSchema();
  const result = await query(
    `SELECT id, name, email, role, email_verified_at FROM ip_users WHERE id = $1 LIMIT 1`,
    [session.user.id],
  );
  const u = result.rows[0];
  if (!u) return jsonError('User not found', 404);
  let phone = '';
  let phoneCountryCode = '+91';
  let phoneVerifiedAt = null;
  if (u.role === 'candidate') {
    const cand = await query(
      `SELECT phone, phone_country_code, phone_verified_at FROM ip_candidates WHERE user_id = $1`,
      [session.user.id],
    );
    phone = cand.rows[0]?.phone || '';
    phoneCountryCode = cand.rows[0]?.phone_country_code || '+91';
    phoneVerifiedAt = cand.rows[0]?.phone_verified_at || null;
  }
  return jsonOk({
    name: u.name || '',
    email: u.email || '',
    role: u.role,
    emailVerifiedAt: u.email_verified_at || null,
    phone,
    phoneCountryCode,
    phoneVerifiedAt,
    profileHref: u.role === 'employer' ? '/employer/profile' : u.role === 'candidate' ? '/candidate/profile' : null,
  });
}

/** Update display name only — email is identity and cannot change here. */
export async function PATCH(request) {
  const { session, error } = await requireSession(['candidate', 'employer', 'superadmin']);
  if (error) return error;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const name = String(body.name || '').trim();
  if (!name) return jsonError('Name is required');
  if (name.length > 120) return jsonError('Name is too long');

  await query(`UPDATE ip_users SET name = $2, updated_at = now() WHERE id = $1`, [session.user.id, name]);
  // Keep candidate/employer display name in sync when profile tables exist
  if (session.user.role === 'candidate') {
    await query(`UPDATE ip_candidates SET name = $2, updated_at = now() WHERE user_id = $1`, [
      session.user.id,
      name,
    ]).catch(() => {});
  }
  if (session.user.role === 'employer') {
    await query(
      `UPDATE ip_employers SET contact_name = COALESCE(NULLIF(contact_name, ''), $2), updated_at = now() WHERE user_id = $1`,
      [session.user.id, name],
    ).catch(() => {});
  }
  return jsonOk({ ok: true, name });
}
