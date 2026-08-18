-- Employer Guidelines & Ethics acknowledgement (DOCX §24)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ip_employers' AND column_name = 'ethics_acks'
  ) THEN
    ALTER TABLE ip_employers ADD COLUMN ethics_acks JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ip_employers' AND column_name = 'ethics_accepted_at'
  ) THEN
    ALTER TABLE ip_employers ADD COLUMN ethics_accepted_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ip_employers' AND column_name = 'ethics_version'
  ) THEN
    ALTER TABLE ip_employers ADD COLUMN ethics_version TEXT;
  END IF;
END $$;
