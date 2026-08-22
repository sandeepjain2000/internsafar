-- Cities / degrees catalogs + offers must point at a real application.
CREATE TABLE IF NOT EXISTS ip_ref_cities (
  city TEXT PRIMARY KEY,
  state_ut TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ip_ref_degrees (
  id INT PRIMARY KEY,
  short_form TEXT NOT NULL,
  full_name TEXT NOT NULL
);

ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS application_id TEXT;

UPDATE ip_offers o
SET application_id = a.id
FROM ip_applications a
WHERE o.application_id IS NULL
  AND a.internship_id = o.internship_id
  AND a.candidate_id = o.candidate_id;

DELETE FROM ip_offers WHERE application_id IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_fkey'
  ) THEN
    ALTER TABLE ip_offers
      ADD CONSTRAINT ip_offers_application_id_fkey
      FOREIGN KEY (application_id) REFERENCES ip_applications(id) ON DELETE CASCADE;
  END IF;
END $$;
