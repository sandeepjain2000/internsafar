-- Optional candidate profile / readiness fields + internship work-hours / engagement / stipend type
-- All candidate fields below are OPTIONAL (do not affect profile_complete).
-- Employer Guidelines & Ethics remain the only mandatory checklist.

ALTER TABLE ip_candidates
  ADD COLUMN IF NOT EXISTS show_profile_picture BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_wired_broadband BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_dedicated_laptop BOOLEAN,
  ADD COLUMN IF NOT EXISTS preferred_hours_start TEXT,
  ADD COLUMN IF NOT EXISTS preferred_hours_end TEXT,
  ADD COLUMN IF NOT EXISTS ongoing_commitment BOOLEAN,
  ADD COLUMN IF NOT EXISTS ongoing_commitment_note TEXT;

ALTER TABLE ip_internships
  ADD COLUMN IF NOT EXISTS work_hours_start TEXT,
  ADD COLUMN IF NOT EXISTS work_hours_end TEXT,
  ADD COLUMN IF NOT EXISTS engagement_type TEXT,
  ADD COLUMN IF NOT EXISTS weekly_hours INT,
  ADD COLUMN IF NOT EXISTS stipend_type TEXT,
  ADD COLUMN IF NOT EXISTS incentive_basis TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_internships_engagement_type_check'
  ) THEN
    ALTER TABLE ip_internships
      ADD CONSTRAINT ip_internships_engagement_type_check
      CHECK (engagement_type IS NULL OR engagement_type IN ('full_time', 'part_time'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_internships_stipend_type_check'
  ) THEN
    ALTER TABLE ip_internships
      ADD CONSTRAINT ip_internships_stipend_type_check
      CHECK (stipend_type IS NULL OR stipend_type IN ('fixed', 'incentive'));
  END IF;
END $$;
