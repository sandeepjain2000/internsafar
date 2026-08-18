-- ISM portal enhancements — additive only on ism_* tables.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ism_internships' AND column_name = 'is_paid'
  ) THEN
    ALTER TABLE ism_internships ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ism_applications' AND column_name = 'screening_answers'
  ) THEN
    ALTER TABLE ism_applications ADD COLUMN screening_answers JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_saved_jobs'
  ) THEN
    CREATE TABLE ism_saved_jobs (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ism_students(id) ON DELETE CASCADE,
      internship_id TEXT NOT NULL REFERENCES ism_internships(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (student_id, internship_id)
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_job_alerts'
  ) THEN
    CREATE TABLE ism_job_alerts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES ism_students(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES ism_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      filters JSONB NOT NULL DEFAULT '{}'::jsonb,
      email_enabled BOOLEAN NOT NULL DEFAULT true,
      inapp_enabled BOOLEAN NOT NULL DEFAULT true,
      active BOOLEAN NOT NULL DEFAULT true,
      last_matched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  END IF;
END $$;
