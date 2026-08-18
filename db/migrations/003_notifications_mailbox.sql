-- Soft-delete + star for in-app notifications (inbox / starred / trash), PH-aligned.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ism_notifications'
  ) THEN
    ALTER TABLE ism_notifications
      ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE ism_notifications
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ism_notif_role_starred
  ON ism_notifications (role, created_at DESC)
  WHERE deleted_at IS NULL AND is_starred = true;

CREATE INDEX IF NOT EXISTS idx_ism_notif_role_trash
  ON ism_notifications (role, created_at DESC)
  WHERE deleted_at IS NOT NULL;
