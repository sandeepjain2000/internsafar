-- Ensure country fields exist for Region/Country filters and profiles.
-- Allowed app values (validated in src/lib/ipRegions.js):
-- India, Pakistan, Bangladesh, Sri Lanka, Nepal, Indonesia, Malaysia, Thailand.
-- No CHECK constraint: list can grow in app without a destructive migration.

ALTER TABLE ip_candidates
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India';

ALTER TABLE ip_employers
  ADD COLUMN IF NOT EXISTS hq_country TEXT DEFAULT 'India';

UPDATE ip_candidates
SET country = 'India'
WHERE country IS NULL OR btrim(country) = '';

UPDATE ip_employers
SET hq_country = 'India'
WHERE hq_country IS NULL OR btrim(hq_country) = '';
