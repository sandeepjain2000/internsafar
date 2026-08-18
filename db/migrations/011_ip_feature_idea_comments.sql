-- Feature idea comments (public discussion on /ideas cards).
CREATE TABLE IF NOT EXISTS ip_feature_idea_comments (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ip_feature_ideas(id) ON DELETE CASCADE,
  author_user_id TEXT REFERENCES ip_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_feature_idea_comments_idea
  ON ip_feature_idea_comments(idea_id, created_at);
