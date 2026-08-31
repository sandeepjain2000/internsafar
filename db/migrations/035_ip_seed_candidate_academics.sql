-- 035_ip_seed_candidate_academics.sql
--
-- Gives the three sign-in-able demo candidates a real multi-row education history, so the
-- Academics section of /candidate/profile can be demonstrated with more than one row.
--
-- Why it was empty: migration 007 already backfills one academic row from the flat
-- ip_candidates columns, but it ran before these candidates existed, so it matched nothing
-- and never ran again. This migration reuses 007's exact id formula for the first row, so
-- the row it creates is the same row 007 would have created and the two cannot duplicate
-- each other.
--
-- It also completes the flat education columns, because two of the three candidates could
-- not show an education section at all: the primary showcase candidate had no college,
-- degree, year or CGPA, and a second had only a college. Existing values are never
-- overwritten — every fill is COALESCE(existing, default).
--
-- Two rows per candidate:
--   sort_order 0 — current qualification, copied from the flat ip_candidates columns
--   sort_order 1 — the school qualification that preceded it
--
-- sort_order 0 is copied rather than invented on purpose: the PUT handler in
-- src/app/api/ip/candidate/academics/route.js mirrors rows[0] back into
-- ip_candidates.college/degree/specialization/study_status/graduation_year/cgpa. Inventing
-- a different first row would leave the profile summary disagreeing with the education
-- list rendered directly below it.
--
-- Scope: only the three cast candidate logins. Academics is rendered on the candidate's
-- own profile only (no employer or SuperAdmin page reads this table), so filling the other
-- 177 candidates would add nothing demonstrable.
--
-- Safe to re-run: rows key on a deterministic id and DO NOTHING on conflict, and every
-- statement skips a candidate whose academics were edited after the seed date, so once a
-- real person curates their own history this migration stops touching it.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

CREATE TEMP TABLE ip_acad_seed (
  email         TEXT PRIMARY KEY,
  college       TEXT NOT NULL,
  degree        TEXT NOT NULL,
  specialization TEXT NOT NULL,
  grad_year     INT  NOT NULL,
  cgpa          TEXT NOT NULL,
  school        TEXT NOT NULL,
  stream        TEXT NOT NULL,
  school_score  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO ip_acad_seed VALUES
  ('lawsonlclintern+1@gmail.com', 'Pune Institute of Computer Technology', 'B.E.',
   'Information Technology', 2027, '8.62',
   'Kendriya Vidyalaya, Pune', 'Science (PCM)', '89%'),
  ('lawsonlclintern+2@gmail.com', 'VIT', 'B.Tech',
   'Electronics and Communication', 2026, '8.15',
   'Delhi Public School, Bengaluru', 'Science (PCM)', '84%'),
  ('lawsonlclintern+3@gmail.com', 'VIT', 'B.Tech',
   'CSE', 2027, '8.40',
   'Loyola Junior College, Chennai', 'Science (PCM + CS)', '91%');

-- Candidates in scope: a cast login whose academics no human has edited since the seed.
CREATE TEMP TABLE ip_acad_target AS
SELECT c.id AS candidate_id, s.*
  FROM ip_candidates c
  JOIN ip_users u ON u.id = c.user_id
  JOIN ip_acad_seed s ON s.email = lower(u.email)
 WHERE NOT EXISTS (
   SELECT 1 FROM ip_candidate_academics a
    WHERE a.candidate_id = c.id
      AND a.updated_at > TIMESTAMPTZ '2026-09-01');

-- ------------------------------- 1. complete the flat columns the summary renders
UPDATE ip_candidates c
   SET college        = coalesce(nullif(btrim(c.college), ''), t.college),
       degree         = coalesce(nullif(btrim(c.degree), ''), t.degree),
       specialization = coalesce(nullif(btrim(c.specialization), ''), t.specialization),
       study_status   = coalesce(nullif(btrim(c.study_status), ''), 'Studying'),
       graduation_year = coalesce(c.graduation_year, t.grad_year),
       -- ip_candidates.cgpa is numeric; ip_candidate_academics.cgpa is text.
       cgpa           = coalesce(c.cgpa, t.cgpa::NUMERIC),
       updated_at     = now()
  FROM ip_acad_target t
 WHERE c.id = t.candidate_id;

-- ------------------------------------- 2. row 0: current qualification (from flat columns)
-- Same id formula as migration 007, so 007 and this migration cannot both create it.
INSERT INTO ip_candidate_academics (
  id, candidate_id, college, degree, specialization, study_status,
  graduation_year, cgpa, row_label, sort_order
)
SELECT
  'ip_acad_' || substr(md5(c.id || coalesce(c.college, '')), 1, 16),
  c.id, c.college, c.degree, c.specialization, c.study_status,
  c.graduation_year, c.cgpa::TEXT, 'Undergraduate', 0
FROM ip_candidates c
JOIN ip_acad_target t ON t.candidate_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM ip_candidate_academics a
   WHERE a.candidate_id = c.id AND a.sort_order = 0)
ON CONFLICT (id) DO NOTHING;

-- 3. re-sync an existing row 0 that predates the fill above and so still reads blank.
UPDATE ip_candidate_academics a
   SET college = c.college,
       degree = c.degree,
       specialization = c.specialization,
       study_status = c.study_status,
       graduation_year = c.graduation_year,
       cgpa = c.cgpa::TEXT,
       row_label = coalesce(nullif(btrim(a.row_label), ''), 'Undergraduate'),
       updated_at = now()
  FROM ip_candidates c
  JOIN ip_acad_target t ON t.candidate_id = c.id
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND (coalesce(a.college, '') <> coalesce(c.college, '')
     OR coalesce(a.degree, '') <> coalesce(c.degree, '')
     OR coalesce(a.specialization, '') <> coalesce(c.specialization, '')
     OR coalesce(a.graduation_year, 0) <> coalesce(c.graduation_year, 0)
     OR coalesce(a.cgpa, '') <> coalesce(c.cgpa::TEXT, ''));

-- ----------------------------------- 4. row 1: the qualification before the degree
INSERT INTO ip_candidate_academics (
  id, candidate_id, college, degree, specialization, study_status,
  graduation_year, cgpa, row_label, sort_order
)
SELECT
  'ip_acad_' || substr(md5(c.id || 'higher-secondary'), 1, 16),
  c.id, t.school, 'Higher Secondary (Class 12)', t.stream, 'Graduated',
  -- Four years before the degree finishes, the normal gap for a B.E./B.Tech.
  coalesce(c.graduation_year, t.grad_year) - 4,
  t.school_score, 'Class 12', 1
FROM ip_candidates c
JOIN ip_acad_target t ON t.candidate_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM ip_candidate_academics a
   WHERE a.candidate_id = c.id AND a.sort_order > 0)
ON CONFLICT (id) DO NOTHING;

DROP TABLE ip_acad_target;

-- ---------------------------------------------------------------- self-verification
-- A migration that silently seeds nothing is worse than one that fails: the section would
-- still be undemonstrable and the run would look successful.
DO $$
DECLARE
  cast_total   INT;
  with_history INT;
  thin_primary INT;
  bad_order    INT;
  mismatched   INT;
BEGIN
  SELECT count(*) INTO cast_total
    FROM ip_candidates c
    JOIN ip_users u ON u.id = c.user_id
    JOIN ip_acad_seed s ON s.email = lower(u.email);

  SELECT count(*) INTO with_history FROM (
    SELECT a.candidate_id FROM ip_candidate_academics a
      JOIN ip_candidates c ON c.id = a.candidate_id
      JOIN ip_users u ON u.id = c.user_id
      JOIN ip_acad_seed s ON s.email = lower(u.email)
     GROUP BY a.candidate_id HAVING count(*) >= 2) q;

  IF cast_total = 0 THEN
    RAISE EXCEPTION 'No cast candidate account found — seed the core sample accounts first.';
  END IF;
  IF with_history < cast_total THEN
    RAISE EXCEPTION 'Expected % cast candidate(s) with a multi-row education history, found %.', cast_total, with_history;
  END IF;

  -- Every seeded primary row must actually read as a qualification.
  SELECT count(*) INTO thin_primary
    FROM ip_candidate_academics a
    JOIN ip_candidates c ON c.id = a.candidate_id
    JOIN ip_users u ON u.id = c.user_id
    JOIN ip_acad_seed s ON s.email = lower(u.email)
   WHERE a.sort_order = 0
     AND (coalesce(btrim(a.college), '') = '' OR coalesce(btrim(a.degree), '') = ''
       OR a.graduation_year IS NULL);
  IF thin_primary > 0 THEN
    RAISE EXCEPTION '% primary academic row(s) are missing a college, degree or year.', thin_primary;
  END IF;

  SELECT count(*) INTO bad_order FROM ip_candidate_academics a0
    JOIN ip_candidate_academics a1
      ON a1.candidate_id = a0.candidate_id AND a1.sort_order > a0.sort_order
   WHERE a1.graduation_year > a0.graduation_year;
  IF bad_order > 0 THEN
    RAISE EXCEPTION '% academic row(s) list an earlier qualification as finishing later than the current one.', bad_order;
  END IF;

  SELECT count(*) INTO mismatched
    FROM ip_candidate_academics a
    JOIN ip_candidates c ON c.id = a.candidate_id
   WHERE a.sort_order = 0
     AND (coalesce(a.college, '') <> coalesce(c.college, '')
       OR coalesce(a.degree, '') <> coalesce(c.degree, ''));
  IF mismatched > 0 THEN
    RAISE EXCEPTION '% candidate(s) have a primary academic row that disagrees with their profile summary.', mismatched;
  END IF;
END $$;
