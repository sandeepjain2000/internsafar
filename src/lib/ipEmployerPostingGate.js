/**
 * Employer posting readiness: SuperAdmin approval + email ownership.
 */
import { query } from '@/lib/db';
import { ensureIpEmployerEmailVerifySchema } from '@/lib/ipEmployerEmailVerify';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';

/**
 * @returns {Promise<{
 *   ok: boolean,
 *   error?: string,
 *   status?: number,
 *   employer?: object,
 *   user?: object,
 *   emailVerified: boolean,
 *   approved: boolean,
 * }>}
 */
export async function getEmployerPostingGate(userId) {
  await ensureIpEmployerApprovalSchema();
  await ensureIpEmployerEmailVerifySchema();
  const row = await query(
    `SELECT u.id as user_id, u.email, u.profile_complete, u.email_verified_at, u.email_verify_required,
            e.id as employer_id, e.approval_status, e.company_name
     FROM ip_users u
     JOIN ip_employers e ON e.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );
  const r = row.rows[0];
  if (!r) {
    return { ok: false, error: 'Employer profile missing', status: 404, emailVerified: false, approved: false };
  }
  const approved = String(r.approval_status || '').toLowerCase() === 'approved';
  const verifyRequired = r.email_verify_required !== false;
  const emailVerified = Boolean(r.email_verified_at) || !verifyRequired;
  if (!approved) {
    return {
      ok: false,
      error: 'Your employer account must be approved by SuperAdmin before posting',
      status: 403,
      emailVerified,
      approved,
      employer: r,
      user: r,
    };
  }
  if (!emailVerified) {
    return {
      ok: false,
      error: 'Verify your email before posting. Check your inbox for the verification link.',
      status: 403,
      emailVerified,
      approved,
      employer: r,
      user: r,
    };
  }
  return { ok: true, emailVerified, approved, employer: r, user: r };
}
