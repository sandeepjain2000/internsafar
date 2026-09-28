-- Per-user notification folders: null = Inbox, set = Archived.
-- Candidates/employers archive instead of deleting; existing rows stay in Inbox.
ALTER TABLE ip_notifications
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
