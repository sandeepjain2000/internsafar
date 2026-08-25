import { query } from '@/lib/db';

let schemaReady = false;

const BLOCKS = [
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_key') THEN
    ALTER TABLE ip_offers ADD CONSTRAINT ip_offers_application_id_key UNIQUE (application_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_status_check') THEN
    ALTER TABLE ip_applications ADD CONSTRAINT ip_applications_status_check
      CHECK (status IN (
        'applied','shortlisted','interviewing','rejected','hired','offered','completed','declined_offer','withdrawn'
      ));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_ratings_from_to_internship_key') THEN
    ALTER TABLE ip_ratings ADD CONSTRAINT ip_ratings_from_to_internship_key
      UNIQUE (from_user_id, to_user_id, internship_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notifications_category_check') THEN
    ALTER TABLE ip_notifications ADD CONSTRAINT ip_notifications_category_check
      CHECK (category IN ('application','referral','system','offer','interview','message'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_referrals_status_check') THEN
    ALTER TABLE ip_referrals ADD CONSTRAINT ip_referrals_status_check
      CHECK (status IN ('pending','completed','invalid'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_feature_ideas_status_check') THEN
    ALTER TABLE ip_feature_ideas ADD CONSTRAINT ip_feature_ideas_status_check
      CHECK (status IN ('Pending approval','Under review','In progress','Planned','Shipped','Declined'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_documents_review_status_check') THEN
    ALTER TABLE ip_employer_documents ADD CONSTRAINT ip_employer_documents_review_status_check
      CHECK (review_status IN ('pending','approved','flagged'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_registration_source_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_registration_source_check
      CHECK (registration_source IN ('legacy','form','google','domain'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_form_approval_status_check') THEN
    ALTER TABLE ip_users ADD CONSTRAINT ip_users_form_approval_status_check
      CHECK (form_approval_status IS NULL OR form_approval_status IN ('pending','approved','rejected'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_jobs_status_check') THEN
    ALTER TABLE ip_bulk_message_jobs ADD CONSTRAINT ip_bulk_message_jobs_status_check
      CHECK (status IN ('pending','running','done'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_status_check') THEN
    ALTER TABLE ip_bulk_message_recipients ADD CONSTRAINT ip_bulk_message_recipients_status_check
      CHECK (status IN ('pending','sent','failed'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_export_jobs_status_check') THEN
    ALTER TABLE ip_export_jobs ADD CONSTRAINT ip_export_jobs_status_check
      CHECK (status IN ('pending','processing','done','failed'));
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_endorsements_employer_candidate_internship_key') THEN
    ALTER TABLE ip_endorsements
      ADD CONSTRAINT ip_endorsements_employer_candidate_internship_key
      UNIQUE (employer_id, candidate_id, internship_id);
  END IF;
END $$`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_referred_by_fkey') THEN
    ALTER TABLE ip_users
      ADD CONSTRAINT ip_users_referred_by_fkey
      FOREIGN KEY (referred_by) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ip_referrals_pending_pair_uidx
  ON ip_referrals (referrer_user_id, referred_user_id)
  WHERE status = 'pending' AND referred_user_id IS NOT NULL`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_notification_preferences_category_check') THEN
    ALTER TABLE ip_notification_preferences
      ADD CONSTRAINT ip_notification_preferences_category_check
      CHECK (category IN ('application','interview','offer','message'));
  END IF;
END $$`,
];

/** Idempotent uniques + CHECKs from migration 027. Missing tables are skipped. */
export async function ensureIpIntegrityConstraints() {
  if (schemaReady) return;
  for (const sql of BLOCKS) {
    try {
      await query(sql);
    } catch (e) {
      if (e.code === '42P01' || e.code === '42703') continue;
      throw e;
    }
  }
  schemaReady = true;
}
