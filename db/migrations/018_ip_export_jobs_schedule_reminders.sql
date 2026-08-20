-- Export jobs + posting schedule reminder flags

CREATE TABLE IF NOT EXISTS ip_export_jobs (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
  created_by_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  include_resumes BOOLEAN NOT NULL DEFAULT false,
  application_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  error TEXT,
  result_csv TEXT,
  result_zip_base64 TEXT,
  result_filename TEXT,
  resume_count INT NOT NULL DEFAULT 0,
  skipped_resumes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ip_export_jobs_employer_idx
  ON ip_export_jobs (employer_id, created_at DESC);

ALTER TABLE ip_internships
  ADD COLUMN IF NOT EXISTS remind_before_start BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remind_before_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remind_start_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS remind_end_hours INT NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS remind_start_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remind_end_sent_at TIMESTAMPTZ;
