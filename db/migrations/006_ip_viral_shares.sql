-- Viral site shares (employer points via social/LinkedIn) + nullable promo internship already separate
CREATE TABLE IF NOT EXISTS ip_viral_shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'linkedin'
    CHECK (channel IN ('linkedin', 'whatsapp', 'twitter', 'other')),
  token TEXT NOT NULL UNIQUE,
  share_url TEXT NOT NULL,
  claimed_post_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'scheduled', 'searching', 'verified', 'failed', 'rewarded', 'fast_track_pending')),
  check_after TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  search_hit BOOLEAN,
  search_notes TEXT,
  points_awarded INT NOT NULL DEFAULT 0,
  credits_awarded INT NOT NULL DEFAULT 0,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_viral_shares_user_idx ON ip_viral_shares(user_id);
CREATE INDEX IF NOT EXISTS ip_viral_shares_check_idx ON ip_viral_shares(check_after) WHERE status IN ('scheduled', 'pending');
