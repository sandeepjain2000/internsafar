import { query } from '@/lib/db';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

let ready = false;

/** Account settings extras: verified flags, phone-change OTP, delivery preferences. */
export async function ensureIpAccountSettingsSchema() {
  if (ready) return;
  await ensureIpCandidateProfileSchema();
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_candidates ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ`);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_phone_change_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      old_phone TEXT,
      new_phone TEXT NOT NULL,
      new_country_code TEXT,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_notification_preferences (
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      in_app BOOLEAN NOT NULL DEFAULT true,
      email BOOLEAN NOT NULL DEFAULT true,
      sms BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, category)
    )
  `);
  ready = true;
}
