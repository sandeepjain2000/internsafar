-- One preset store: ip_saved_applicant_views. Copy leftover ip_list_presets, then drop it.
-- Copy unscoped employer.applicants rows onto each posting key.

DO $$
BEGIN
  IF to_regclass('public.ip_list_presets') IS NOT NULL THEN
    INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, created_at, updated_at, user_id, table_key, sort, is_default)
    SELECT p.id, NULL, p.name, p.filters, p.created_at, p.updated_at, p.user_id, p.table_key, p.sort, p.is_default
    FROM ip_list_presets p
    WHERE NOT EXISTS (SELECT 1 FROM ip_saved_applicant_views sav WHERE sav.id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM ip_saved_applicant_views sav
        WHERE sav.user_id = p.user_id AND sav.table_key = p.table_key AND sav.name = p.name
      );
  END IF;
END $$;

INSERT INTO ip_saved_applicant_views (id, employer_id, name, filters, created_at, updated_at, user_id, table_key, sort, is_default)
SELECT sav.id || '-' || i.id, sav.employer_id, sav.name, sav.filters, sav.created_at, sav.updated_at,
       sav.user_id, 'employer.applicants.' || i.id, sav.sort, sav.is_default
FROM ip_saved_applicant_views sav
JOIN ip_internships i ON i.employer_id = sav.employer_id
WHERE sav.table_key = 'employer.applicants'
  AND sav.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ip_saved_applicant_views x
    WHERE x.user_id = sav.user_id AND x.table_key = 'employer.applicants.' || i.id AND x.name = sav.name
  )
  AND (
    SELECT count(*) FROM ip_saved_applicant_views x
    WHERE x.user_id = sav.user_id AND x.table_key = 'employer.applicants.' || i.id
  ) < 5;

DELETE FROM ip_saved_applicant_views WHERE table_key = 'employer.applicants';

DROP TABLE IF EXISTS ip_list_presets;
