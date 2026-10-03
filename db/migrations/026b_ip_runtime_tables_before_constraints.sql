-- 026b: objects the app creates at runtime that 027 / 028 already alter.
-- On a fresh (Path C) database these did not exist yet, so 027 / 028 failed.
-- Definitions match ensureIpTwoFactorSchema, ensureIpAccountSettingsSchema and
-- ensureIpNotificationCategorySchema. Additive only: no-op on live databases.

ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS ip_2fa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_2fa_challenges_user
  ON ip_2fa_challenges(user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_notification_preferences (
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  in_app BOOLEAN NOT NULL DEFAULT true,
  email BOOLEAN NOT NULL DEFAULT true,
  sms BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
