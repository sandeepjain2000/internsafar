-- Endorsements always belong to a candidate (API + seed scripts never INSERT without one).
-- Live check: count NULL candidate_id then SET NOT NULL. Do not invent candidates.
-- Export jobs: record application IDs skipped because they no longer exist.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ip_endorsements WHERE candidate_id IS NULL;
  RAISE NOTICE 'ip_endorsements rows with NULL candidate_id: %', n;
  IF n > 0 THEN
    RAISE EXCEPTION
      'ip_endorsements has % row(s) with NULL candidate_id; will not SET NOT NULL (no silent delete)',
      n;
  END IF;
END $$;

ALTER TABLE ip_endorsements ALTER COLUMN candidate_id SET NOT NULL;

ALTER TABLE ip_export_jobs
  ADD COLUMN IF NOT EXISTS skipped_application_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
