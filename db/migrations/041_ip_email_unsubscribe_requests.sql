-- Collect unsubscribe clicks as PENDING requests. Does not disable email delivery.
CREATE TABLE IF NOT EXISTS ip_email_unsubscribe_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ip_email_unsubscribe_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_email_unsubscribe_requests_status_check'
  ) THEN
    ALTER TABLE ip_email_unsubscribe_requests
      ADD CONSTRAINT ip_email_unsubscribe_requests_status_check
      CHECK (status IN ('PENDING', 'PROCESSED'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ip_email_unsubscribe_requests_email_pending_uidx
  ON ip_email_unsubscribe_requests (email)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS ip_email_unsubscribe_requests_status_requested_idx
  ON ip_email_unsubscribe_requests (status, requested_at);
