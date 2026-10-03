-- 048_ip_lookup_indexes.sql
--
-- Per-user lookups that previously scanned whole tables:
--   notifications bell / list      → ip_notifications(user_id, created_at DESC)
--   candidate / employer inbox     → ip_message_threads(candidate_user_id), (employer_user_id)
--   candidate offers list          → ip_offers(candidate_id)
--   candidate applications list    → ip_applications(candidate_id)
--
-- Additive only; safe to re-run (IF NOT EXISTS). No data changes.

CREATE INDEX IF NOT EXISTS ip_notifications_user_created_idx
  ON ip_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ip_message_threads_candidate_user_idx
  ON ip_message_threads (candidate_user_id);

CREATE INDEX IF NOT EXISTS ip_message_threads_employer_user_idx
  ON ip_message_threads (employer_user_id);

CREATE INDEX IF NOT EXISTS ip_offers_candidate_idx
  ON ip_offers (candidate_id);

CREATE INDEX IF NOT EXISTS ip_applications_candidate_idx
  ON ip_applications (candidate_id);
