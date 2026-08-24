ALTER TABLE ip_table_filter_prefs ADD COLUMN IF NOT EXISTS sort TEXT;

CREATE TABLE IF NOT EXISTS ip_list_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  table_key TEXT NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, table_key, name)
);

CREATE INDEX IF NOT EXISTS ip_list_presets_user_table_idx
  ON ip_list_presets (user_id, table_key);
