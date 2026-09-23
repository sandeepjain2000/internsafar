import { query } from '@/lib/db';

let schemaReady = false;

/**
 * Idempotent columns for registration_source + related live fields.
 * Form-approval / manual-request schema is retired (see ensureIpRetireDeadQueuesSchema).
 */
export async function ensureIpFormRegistrationSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'legacy'`);
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS free_post_credits INT DEFAULT 1`);
  await query(`ALTER TABLE ip_employers ADD COLUMN IF NOT EXISTS business_entity_type text`);
  // Widen registration_source for live paths (domain / free_email) + historical labels.
  await query(`DO $$ BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ip_users_registration_source_check'
        AND pg_get_constraintdef(oid) NOT LIKE '%free_email%'
    ) THEN
      ALTER TABLE ip_users DROP CONSTRAINT ip_users_registration_source_check;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_registration_source_check'
    ) THEN
      ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
        CHECK (registration_source IN ('legacy','form','google','domain','gmail_domain','free_email'));
    END IF;
  END $$`);
  schemaReady = true;
}
