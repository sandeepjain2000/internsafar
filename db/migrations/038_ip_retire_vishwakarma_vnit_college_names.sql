-- 038_ip_retire_vishwakarma_vnit_college_names.sql
--
-- Remove college names that read as "VIT" even when spelled out (Vishwakarma Institute
-- of Technology, Pune) or abbreviated (VNIT, Nagpur). Same replacement map as
-- scripts/lib/ipDemoText.js so future seeds stay clean.
--
-- Safe to re-run: only matching rows not edited since this file was written (updated_at
-- before the 2026-09-02 IST cutoff) are updated, so real candidates who saved these colleges
-- later are never rewritten on replay.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

UPDATE ip_candidates
   SET college = 'Pimpri Chinchwad College of Engineering, Pune',
       updated_at = now()
 WHERE btrim(coalesce(college, '')) ILIKE 'Vishwakarma Institute of Technology, Pune'
   AND updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

UPDATE ip_candidates
   SET college = 'Yeshwantrao Chavan College of Engineering, Nagpur',
       updated_at = now()
 WHERE btrim(coalesce(college, '')) ILIKE 'VNIT, Nagpur'
   AND updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

UPDATE ip_candidate_academics a
   SET college = 'Pimpri Chinchwad College of Engineering, Pune',
       updated_at = now()
 WHERE btrim(coalesce(a.college, '')) ILIKE 'Vishwakarma Institute of Technology, Pune'
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

UPDATE ip_candidate_academics a
   SET college = 'Yeshwantrao Chavan College of Engineering, Nagpur',
       updated_at = now()
 WHERE btrim(coalesce(a.college, '')) ILIKE 'VNIT, Nagpur'
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30';

-- Keep row 0 in sync with flat ip_candidates columns, only for rows untouched since the cutoff.
UPDATE ip_candidate_academics a
   SET college = c.college,
       updated_at = now()
  FROM ip_candidates c
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND a.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND c.updated_at < TIMESTAMPTZ '2026-09-02 00:00:00+05:30'
   AND coalesce(a.college, '') <> coalesce(c.college, '');
