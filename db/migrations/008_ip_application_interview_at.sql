-- Scheduled interview time for candidate pending-actions / employer pipeline.
ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ;
