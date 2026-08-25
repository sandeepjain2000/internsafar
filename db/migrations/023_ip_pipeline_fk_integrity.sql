-- Pipeline FK integrity follow-up after 019 (offers → applications).
-- Live audit (InternSafar sibling DB, 2026-08-25): 0 orphaned offers, 0 dangling
-- rejection_template_id / generated_run_id / reviewed_by / message_id / request user ids.
-- Message threads: 2 rows; 1 matchable to an application; 1 general (no internship) left NULL.
-- No rows deleted in this migration.

-- 1) Offers must always have an application (019 added the FK but left the column nullable).
UPDATE ip_offers o
SET application_id = a.id
FROM ip_applications a
WHERE o.application_id IS NULL
  AND a.internship_id = o.internship_id
  AND a.candidate_id = o.candidate_id;

DO $$
DECLARE unmatched int;
BEGIN
  SELECT count(*) INTO unmatched FROM ip_offers WHERE application_id IS NULL;
  RAISE NOTICE 'ip_offers unmatched after backfill (will DELETE): %', unmatched;
  DELETE FROM ip_offers WHERE application_id IS NULL;
END $$;

ALTER TABLE ip_offers ALTER COLUMN application_id SET NOT NULL;

-- 2) Optional application on message threads (pre-application invite remains NULL).
ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS application_id TEXT;

UPDATE ip_message_threads t
SET application_id = a.id
FROM ip_candidates c
JOIN ip_applications a ON a.candidate_id = c.id
WHERE t.application_id IS NULL
  AND t.internship_id IS NOT NULL
  AND c.user_id = t.candidate_user_id
  AND a.internship_id = t.internship_id;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_message_threads_application_id_fkey') THEN
    ALTER TABLE ip_message_threads
      ADD CONSTRAINT ip_message_threads_application_id_fkey
      FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ip_message_threads_application_idx
  ON ip_message_threads (application_id)
  WHERE application_id IS NOT NULL;

-- Threads always have both parties in current product writes (invite / bulk / threads POST).
ALTER TABLE ip_message_threads ALTER COLUMN candidate_user_id SET NOT NULL;
ALTER TABLE ip_message_threads ALTER COLUMN employer_user_id SET NOT NULL;

-- 3) Application → rejection template (nullable; system template has employer_id NULL).
UPDATE ip_applications
SET rejection_template_id = NULL
WHERE rejection_template_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_rejection_templates t WHERE t.id = ip_applications.rejection_template_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_applications_rejection_template_id_fkey') THEN
    ALTER TABLE ip_applications
      ADD CONSTRAINT ip_applications_rejection_template_id_fkey
      FOREIGN KEY (rejection_template_id) REFERENCES ip_rejection_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) Generated-run tagging on users.
UPDATE ip_users
SET generated_run_id = NULL
WHERE generated_run_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_generated_runs g WHERE g.run_id = ip_users.generated_run_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_users_generated_run_id_fkey') THEN
    ALTER TABLE ip_users
      ADD CONSTRAINT ip_users_generated_run_id_fkey
      FOREIGN KEY (generated_run_id) REFERENCES ip_generated_runs(run_id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5) SuperAdmin reviewer columns (nullable audit fields).
UPDATE ip_linkedin_promotions
SET reviewed_by = NULL
WHERE reviewed_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = ip_linkedin_promotions.reviewed_by);

UPDATE ip_viral_shares
SET reviewed_by = NULL
WHERE reviewed_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = ip_viral_shares.reviewed_by);

UPDATE ip_employer_requests
SET created_user_id = NULL
WHERE created_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = ip_employer_requests.created_user_id);

UPDATE ip_employer_requests
SET reviewer_id = NULL
WHERE reviewer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_users u WHERE u.id = ip_employer_requests.reviewer_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_linkedin_promotions_reviewed_by_fkey') THEN
    ALTER TABLE ip_linkedin_promotions
      ADD CONSTRAINT ip_linkedin_promotions_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_viral_shares_reviewed_by_fkey') THEN
    ALTER TABLE ip_viral_shares
      ADD CONSTRAINT ip_viral_shares_reviewed_by_fkey
      FOREIGN KEY (reviewed_by) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_requests_created_user_id_fkey') THEN
    ALTER TABLE ip_employer_requests
      ADD CONSTRAINT ip_employer_requests_created_user_id_fkey
      FOREIGN KEY (created_user_id) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_requests_reviewer_id_fkey') THEN
    ALTER TABLE ip_employer_requests
      ADD CONSTRAINT ip_employer_requests_reviewer_id_fkey
      FOREIGN KEY (reviewer_id) REFERENCES ip_users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6) Bulk-message recipient → sent message (optional).
UPDATE ip_bulk_message_recipients
SET message_id = NULL
WHERE message_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM ip_messages m WHERE m.id = ip_bulk_message_recipients.message_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_bulk_message_recipients_message_id_fkey') THEN
    ALTER TABLE ip_bulk_message_recipients
      ADD CONSTRAINT ip_bulk_message_recipients_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES ip_messages(id) ON DELETE SET NULL;
  END IF;
END $$;
