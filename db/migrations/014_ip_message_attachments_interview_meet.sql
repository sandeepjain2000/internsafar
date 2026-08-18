-- Stored interview meeting URL + chat attachments (no fake Meet links).
ALTER TABLE ip_applications
  ADD COLUMN IF NOT EXISTS interview_meet_url TEXT;

ALTER TABLE ip_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size INT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;
