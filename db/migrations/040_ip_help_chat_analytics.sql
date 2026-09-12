-- Additive analytics for InternSafar Help Chatbot (no destructive SQL).
CREATE TABLE IF NOT EXISTS ip_help_chat_events (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id text,
  role text,
  topic text,
  fallback_state text,
  success boolean NOT NULL DEFAULT false,
  latency_ms integer,
  model text,
  knowledge_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  pathname text,
  feedback text,
  feedback_reason text,
  unanswered boolean NOT NULL DEFAULT false
);

ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS feedback text;
ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS feedback_reason text;
ALTER TABLE ip_help_chat_events ADD COLUMN IF NOT EXISTS unanswered boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ip_help_chat_events_created_idx ON ip_help_chat_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ip_help_chat_events_topic_idx ON ip_help_chat_events (topic);
