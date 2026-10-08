-- Weekly "upload your documents" reminder for pending employers with no active documents.
-- One row per employer (employer_id is both PK and FK → ip_employers.id).
-- sent_count = automated reminders sent; the job stops at its cap (2).
-- manual_contact_at = SuperAdmin already emailed by hand; the next automated send waits a week from it.
-- No row = never reminded (no blank-fill needed on existing databases).
CREATE TABLE IF NOT EXISTS ip_employer_docs_reminders (
  employer_id TEXT PRIMARY KEY REFERENCES ip_employers(id) ON DELETE CASCADE,
  sent_count INT NOT NULL DEFAULT 0,
  first_sent_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  manual_contact_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_employer_docs_reminders_sent_count_check'
  ) THEN
    ALTER TABLE ip_employer_docs_reminders
      ADD CONSTRAINT ip_employer_docs_reminders_sent_count_check CHECK (sent_count >= 0);
  END IF;
END $$;
