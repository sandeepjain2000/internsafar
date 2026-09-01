-- 038_ip_retire_vishwakarma_vnit_college_names.sql
--
-- Remove college names that read as "VIT" even when spelled out (Vishwakarma Institute
-- of Technology, Pune) or abbreviated (VNIT, Nagpur). Same replacement map as
-- scripts/lib/ipDemoText.js so future seeds stay clean.
--
-- Safe to re-run: only matching rows are updated.
-- The runner (scripts/db_exec_sql_file.js) supplies BEGIN/COMMIT.

UPDATE ip_candidates
   SET college = 'Pimpri Chinchwad College of Engineering, Pune',
       updated_at = now()
 WHERE btrim(coalesce(college, '')) ILIKE 'Vishwakarma Institute of Technology, Pune';

UPDATE ip_candidates
   SET college = 'Yeshwantrao Chavan College of Engineering, Nagpur',
       updated_at = now()
 WHERE btrim(coalesce(college, '')) ILIKE 'VNIT, Nagpur';

UPDATE ip_candidate_academics a
   SET college = 'Pimpri Chinchwad College of Engineering, Pune',
       updated_at = now()
 WHERE btrim(coalesce(a.college, '')) ILIKE 'Vishwakarma Institute of Technology, Pune';

UPDATE ip_candidate_academics a
   SET college = 'Yeshwantrao Chavan College of Engineering, Nagpur',
       updated_at = now()
 WHERE btrim(coalesce(a.college, '')) ILIKE 'VNIT, Nagpur';

-- Keep row 0 in sync with flat ip_candidates columns.
UPDATE ip_candidate_academics a
   SET college = c.college,
       updated_at = now()
  FROM ip_candidates c
 WHERE a.candidate_id = c.id
   AND a.sort_order = 0
   AND coalesce(a.college, '') <> coalesce(c.college, '');
