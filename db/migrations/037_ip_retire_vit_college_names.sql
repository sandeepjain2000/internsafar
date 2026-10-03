-- 037_ip_retire_vit_college_names.sql
--
-- Remove VIT / VIT Vellore from live candidate education. Cast demo accounts get the same
-- colleges as ipCoreSampleConfig.js and 035; any other generated row with a VIT mention
-- is mapped to RV College of Engineering so filler data stays realistic.
--
-- Safe to re-run: only rows whose college still mentions VIT are updated, and only rows not
-- edited since this file was written (updated_at before the 2026-09-02 IST cutoff). A real
-- candidate who studies at VIT and saved that afterwards is never rewritten on replay.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

-- Cast +2 (Arjun): Bengaluru ECE profile
UPDATE ip_candidates c
   SET college = 'BMS College of Engineering',
       updated_at = now()
  FROM ip_users u
 WHERE c.user_id = u.id
   AND lower(u.email) = lower('lawsonlclintern+2@gmail.com')
   AND btrim(coalesce(c.college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND c.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

UPDATE ip_candidate_academics a
   SET college = 'BMS College of Engineering',
       updated_at = now()
  FROM ip_candidates c
  JOIN ip_users u ON u.id = c.user_id
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND lower(u.email) = lower('lawsonlclintern+2@gmail.com')
   AND btrim(coalesce(a.college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

-- Cast +3 (Meera): Chennai CSE profile
UPDATE ip_candidates c
   SET college = 'SRM Institute of Science and Technology',
       city = 'Chennai',
       updated_at = now()
  FROM ip_users u
 WHERE c.user_id = u.id
   AND lower(u.email) = lower('lawsonlclintern+3@gmail.com')
   AND btrim(coalesce(c.college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND c.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

UPDATE ip_candidate_academics a
   SET college = 'SRM Institute of Science and Technology',
       updated_at = now()
  FROM ip_candidates c
  JOIN ip_users u ON u.id = c.user_id
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND lower(u.email) = lower('lawsonlclintern+3@gmail.com')
   AND btrim(coalesce(a.college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

-- Any other candidate row still naming VIT (generated filler, old QA leftovers, etc.)
UPDATE ip_candidates
   SET college = 'RV College of Engineering',
       updated_at = now()
 WHERE btrim(coalesce(college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND id NOT IN (
     SELECT c.id FROM ip_candidates c
     JOIN ip_users u ON u.id = c.user_id
     WHERE lower(u.email) IN (
       lower('lawsonlclintern+2@gmail.com'),
       lower('lawsonlclintern+3@gmail.com')
     )
   );

UPDATE ip_candidate_academics a
   SET college = 'RV College of Engineering',
       updated_at = now()
 WHERE btrim(coalesce(a.college, '')) ~* '(^|\s)vit(\s|$|vellore)'
   AND a.sort_order = 0
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND a.candidate_id NOT IN (
     SELECT c.id FROM ip_candidates c
     JOIN ip_users u ON u.id = c.user_id
     WHERE lower(u.email) IN (
       lower('lawsonlclintern+2@gmail.com'),
       lower('lawsonlclintern+3@gmail.com')
     )
   );

-- Keep row 0 in sync with flat ip_candidates columns, only for rows untouched since the cutoff.
UPDATE ip_candidate_academics a
   SET college = c.college,
       degree = c.degree,
       specialization = c.specialization,
       study_status = c.study_status,
       graduation_year = c.graduation_year,
       cgpa = c.cgpa::TEXT,
       updated_at = now()
  FROM ip_candidates c
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND c.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND (coalesce(a.college, '') <> coalesce(c.college, '')
     OR coalesce(a.degree, '') <> coalesce(c.degree, '')
     OR coalesce(a.specialization, '') <> coalesce(c.specialization, '')
     OR coalesce(a.graduation_year, 0) <> coalesce(c.graduation_year, 0)
     OR coalesce(a.cgpa, '') <> coalesce(c.cgpa::TEXT, ''));
