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
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS contact_designation text`);
  await query(`ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS password_hash text`);
  schemaReady = true;
}
