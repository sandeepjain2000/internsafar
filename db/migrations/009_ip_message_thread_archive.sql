-- Per-user archive flags on message threads (candidate vs employer independently).
ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS candidate_archived_at TIMESTAMPTZ;
ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS employer_archived_at TIMESTAMPTZ;
