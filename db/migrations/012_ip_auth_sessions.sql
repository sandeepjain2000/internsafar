-- Trackable auth sessions for Account → Active Sessions (JWT sid → row).
CREATE TABLE IF NOT EXISTS ip_auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  user_agent TEXT,
  ip TEXT,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ip_auth_sessions_user
  ON ip_auth_sessions(user_id, revoked_at, last_seen_at DESC);
