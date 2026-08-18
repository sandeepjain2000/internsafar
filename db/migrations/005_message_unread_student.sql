-- Per-role unread for messaging (employer vs student).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_message_threads'
  ) THEN
    ALTER TABLE ism_message_threads
      ADD COLUMN IF NOT EXISTS unread_student INT NOT NULL DEFAULT 0;
  END IF;
END $$;
