-- Country / Region dropdown options (additive catalog).
-- Used by candidate + employer profile Country and list Region filters.
-- Does not modify existing profile country values except null → India.

CREATE TABLE IF NOT EXISTS ip_ref_countries (
  country TEXT PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT INTO ip_ref_countries (country, sort_order) VALUES
  ('India', 1),
  ('Pakistan', 2),
  ('Bangladesh', 3),
  ('Sri Lanka', 4),
  ('Nepal', 5),
  ('Indonesia', 6),
  ('Malaysia', 7),
  ('Thailand', 8)
ON CONFLICT (country) DO UPDATE SET
  sort_order = EXCLUDED.sort_order;

-- Ensure profile value columns exist (idempotent; no wipe of other data)
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
