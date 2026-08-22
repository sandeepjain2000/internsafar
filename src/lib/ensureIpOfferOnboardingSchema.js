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
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT`);
  await query(`
    UPDATE ip_offers o
    SET application_id = a.id
    FROM ip_applications a
    WHERE o.application_id IS NULL
      AND a.internship_id = o.internship_id
      AND a.candidate_id = o.candidate_id
  `);
  await query(`DELETE FROM ip_offers WHERE application_id IS NULL`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_fkey') THEN
        ALTER TABLE ip_offers
          ADD CONSTRAINT ip_offers_application_id_fkey
          FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE CASCADE;
      END IF;
    END $$
  `);
  schemaReady = true;
}
