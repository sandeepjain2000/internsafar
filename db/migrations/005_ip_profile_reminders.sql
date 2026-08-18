-- Incomplete profile reminder tracking (§26)
ALTER TABLE ip_users
  ADD COLUMN IF NOT EXISTS profile_reminder_last_shown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_reminder_last_login_count INT NOT NULL DEFAULT 0;
