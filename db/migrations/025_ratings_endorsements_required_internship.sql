-- Remove leftover ratings with no internship (product now always names one).
-- Require endorsement employer + internship (API always sent them; live had 0 nulls).

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM ip_ratings WHERE internship_id IS NULL;
  RAISE NOTICE 'ip_ratings deleted (null internship_id): %', n;
  DELETE FROM ip_ratings WHERE internship_id IS NULL;
END $$;

ALTER TABLE ip_ratings DROP CONSTRAINT IF EXISTS ip_ratings_internship_id_fkey;
ALTER TABLE ip_ratings ALTER COLUMN internship_id SET NOT NULL;
ALTER TABLE ip_ratings
  ADD CONSTRAINT ip_ratings_internship_id_fkey
  FOREIGN KEY (internship_id) REFERENCES ip_internships(id) ON DELETE CASCADE;

DO $$
DECLARE n_emp int;
DECLARE n_int int;
BEGIN
  SELECT count(*) INTO n_emp FROM ip_endorsements WHERE employer_id IS NULL;
  SELECT count(*) INTO n_int FROM ip_endorsements WHERE internship_id IS NULL;
  RAISE NOTICE 'ip_endorsements null employer_id: %, null internship_id: %', n_emp, n_int;
  IF n_emp > 0 OR n_int > 0 THEN
    RAISE EXCEPTION
      'Cannot SET NOT NULL on endorsements: % null employer_id, % null internship_id',
      n_emp, n_int;
  END IF;
END $$;

ALTER TABLE ip_endorsements DROP CONSTRAINT IF EXISTS ip_endorsements_employer_id_fkey;
ALTER TABLE ip_endorsements DROP CONSTRAINT IF EXISTS ip_endorsements_internship_id_fkey;
ALTER TABLE ip_endorsements ALTER COLUMN employer_id SET NOT NULL;
ALTER TABLE ip_endorsements ALTER COLUMN internship_id SET NOT NULL;
ALTER TABLE ip_endorsements
  ADD CONSTRAINT ip_endorsements_employer_id_fkey
  FOREIGN KEY (employer_id) REFERENCES ip_employers(id) ON DELETE CASCADE;
ALTER TABLE ip_endorsements
  ADD CONSTRAINT ip_endorsements_internship_id_fkey
  FOREIGN KEY (internship_id) REFERENCES ip_internships(id) ON DELETE CASCADE;
