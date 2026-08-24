-- Generalize named list presets (was employer-applicant only) onto the existing table.
ALTER TABLE ip_saved_applicant_views ALTER COLUMN employer_id DROP NOT NULL;
ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES ip_users(id) ON DELETE CASCADE;
ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS table_key TEXT;
ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS sort TEXT;
ALTER TABLE ip_saved_applicant_views ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ip_saved_applicant_views DROP CONSTRAINT IF EXISTS ip_saved_applicant_views_employer_id_name_key;

UPDATE ip_saved_applicant_views sav
SET user_id = e.user_id,
    table_key = COALESCE(NULLIF(sav.table_key, ''), 'employer.applicants')
FROM ip_employers e
WHERE e.id = sav.employer_id
  AND sav.user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ip_saved_views_user_table_name_uidx
  ON ip_saved_applicant_views (user_id, table_key, name)
  WHERE user_id IS NOT NULL AND table_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ip_saved_views_user_table_idx
  ON ip_saved_applicant_views (user_id, table_key);
