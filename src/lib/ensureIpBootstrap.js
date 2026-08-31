import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { newId, referralCodeFrom } from '@/lib/ids';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import { ensureIpMessageArchiveSchema } from '@/lib/ensureIpMessageArchiveSchema';
import { ensureIpNotificationCategorySchema } from '@/lib/ensureIpNotificationCategorySchema';
import { ensureIpFeatureIdeaCommentsSchema } from '@/lib/ensureIpFeatureIdeaCommentsSchema';
import { ensureIpAuthSessionsSchema } from '@/lib/ensureIpAuthSessionsSchema';
import { ensureIpTwoFactorSchema } from '@/lib/ipTwoFactor';
import { ensureIpApplicationInterviewSchema } from '@/lib/ensureIpApplicationInterviewSchema';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';
import { ensureIpMessageAttachmentSchema } from '@/lib/ensureIpMessageAttachmentSchema';
import { ensureIpOfferOnboardingSchema } from '@/lib/ensureIpOfferOnboardingSchema';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { ensureIpIntegrityConstraints } from '@/lib/ensureIpIntegrityConstraints';

const DEMO_PASSWORD = 'Admin@123';
/**
 * Showcase / ops SuperAdmin login. Single account, so it holds the Zoho support
 * address directly — Zoho has no plus-addressing, and only the employer side
 * needs +aliases (those live on the Gmail mailbox instead).
 */
export const SUPERADMIN_EMAIL = 'support@placementhub.online';
const LEGACY_SUPERADMIN_EMAIL = 'superadmin@internship.local';

/**
 * Ensure SuperAdmin support@placementhub.online / Admin@123 exists.
 * Does not recreate @internship.local demo candidate/employer accounts.
 */
export async function ensureIpBootstrap() {
  await ensureIpFormRegistrationSchema();
  await ensureIpMessageArchiveSchema();
  await ensureIpNotificationCategorySchema();
  await ensureIpFeatureIdeaCommentsSchema();
  await ensureIpAuthSessionsSchema();
  await ensureIpTwoFactorSchema();
  await ensureIpApplicationInterviewSchema();
  await ensureIpCandidateProfileSchema();
  await ensureIpMessageAttachmentSchema();
  await ensureIpOfferOnboardingSchema();
  await ensureIpEmployerApprovalSchema();
  await ensureIpIntegrityConstraints();
  let initialized = false;
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const target = await query(`SELECT id, role FROM ip_users WHERE lower(email) = lower($1)`, [SUPERADMIN_EMAIL]);
  const legacy = await query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [LEGACY_SUPERADMIN_EMAIL]);

  if (target.rows[0]) {
    await query(
      `UPDATE ip_users
       SET role = 'superadmin',
           password_hash = $2,
           name = COALESCE(NULLIF(name, ''), 'Portal SuperAdmin'),
           active = true,
           updated_at = now()
       WHERE id = $1`,
      [target.rows[0].id, hash],
    );
    if (legacy.rows[0] && legacy.rows[0].id !== target.rows[0].id) {
      await query(`UPDATE ip_users SET active = false, updated_at = now() WHERE id = $1`, [legacy.rows[0].id]);
    }
  } else if (legacy.rows[0]) {
    await query(
      `UPDATE ip_users
       SET email = $2,
           role = 'superadmin',
           password_hash = $3,
           name = 'Portal SuperAdmin',
           active = true,
           updated_at = now()
       WHERE id = $1`,
      [legacy.rows[0].id, SUPERADMIN_EMAIL, hash],
    );
    initialized = true;
  } else {
    const existingNone = await query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [SUPERADMIN_EMAIL]);
    if (!existingNone.rows[0]) {
      const id = newId('ip_user');
      await query(
        `INSERT INTO ip_users (id, email, password_hash, role, name, points, free_post_credits,
          application_allowance, referral_code, profile_complete, active)
         VALUES ($1,$2,$3,'superadmin','Portal SuperAdmin',0,0,0,$4,true,true)`,
        [id, SUPERADMIN_EMAIL, hash, referralCodeFrom(SUPERADMIN_EMAIL)],
      );
      initialized = true;
    }
  }

  // There is exactly one SuperAdmin. Promoting the target above is not enough on its own:
  // this function only ever granted the role and never removed it, so any account that once
  // held it kept it forever. That is how the core EMPLOYER (Nova Labs) stayed able to sign in
  // at /superadmin after the address swap — an older deployed build carried the previous
  // constant and promoted it on every sign-in page hit against the shared database.
  // Demote strays back to the role their owned profile proves they are. An account with no
  // candidate or employer profile is left alone rather than guessed at; the demo-consistency
  // audit reports it instead.
  await query(
    `UPDATE ip_users u
        SET role = CASE
                     WHEN EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id) THEN 'employer'
                     WHEN EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id) THEN 'candidate'
                     ELSE u.role
                   END,
            updated_at = now()
      WHERE u.role = 'superadmin'
        AND lower(u.email) <> lower($1)
        AND (EXISTS (SELECT 1 FROM ip_employers e WHERE e.user_id = u.id)
          OR EXISTS (SELECT 1 FROM ip_candidates c WHERE c.user_id = u.id))`,
    [SUPERADMIN_EMAIL],
  );

  return {
    initialized,
    accounts: [SUPERADMIN_EMAIL],
  };
}
