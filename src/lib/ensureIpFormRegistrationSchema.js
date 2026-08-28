import { query } from '@/lib/db';

let schemaReady = false;

/**
 * Idempotent columns for form registration + SA allow/reject.
 * Safe to call from bootstrap and register routes (prod may not run SQL migrations).
 */
export async function ensureIpFormRegistrationSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'legacy'`);
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS form_approval_status text`);
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS free_post_credits INT DEFAULT 1`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS contact_designation text`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS password_hash text`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS business_entity_type text`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS business_entity_type text`);
  // Widen registration_source to allow 'gmail_domain' before any register route inserts it.
  await query(`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ip_users_registration_source_check'
        AND pg_get_constraintdef(oid) NOT LIKE '%gmail_domain%'
    ) THEN
      ALTER TABLE ip_users DROP CONSTRAINT ip_users_registration_source_check;
      ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
        CHECK (registration_source IN ('legacy','form','google','domain','gmail_domain'));
    END IF;
  END $$`);
  schemaReady = true;
}
