import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent onboarding / HR / mentor / end_date columns on ip_offers. */
export async function ensureIpOfferOnboardingSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS end_date DATE`);
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS onboarding_instructions TEXT`);
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS mentor_name TEXT`);
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS hr_contact_email TEXT`);
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS hr_contact_phone TEXT`);
  schemaReady = true;
}
