-- InternSafar workbench: posting schedule, application screening snapshot/cap helpers, locations
-- Additive only; preserves existing start_date/end_date as internship program dates.

ALTER TABLE ip_internships
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apply_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS ip_internships_visibility_idx
  ON ip_internships (status, starts_at, apply_ends_at);

CREATE INDEX IF NOT EXISTS ip_internships_locations_gin
  ON ip_internships USING GIN (locations);

ALTER TABLE ip_applications
  ADD COLUMN IF NOT EXISTS questions_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS screening_disabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS screening_disable_reason JSONB,
  ADD COLUMN IF NOT EXISTS rejection_template_id TEXT,
  ADD COLUMN IF NOT EXISTS rejection_template_version INT;

CREATE INDEX IF NOT EXISTS ip_applications_internship_status_idx
  ON ip_applications (internship_id, status);

CREATE INDEX IF NOT EXISTS ip_applications_screening_disabled_idx
  ON ip_applications (internship_id, screening_disabled)
  WHERE screening_disabled = true;

-- Generated test-data run tracking
CREATE TABLE IF NOT EXISTS ip_generated_runs (
  run_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE ip_users
  ADD COLUMN IF NOT EXISTS generated_run_id TEXT;

CREATE INDEX IF NOT EXISTS ip_users_generated_run_idx
  ON ip_users (generated_run_id)
  WHERE generated_run_id IS NOT NULL;
