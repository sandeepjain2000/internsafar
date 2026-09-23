-- Optional upper bound for internship stipend ranges (₹min–₹max).
-- stipend_inr remains the fixed amount or range floor; null max = single amount.
ALTER TABLE ip_internships
  ADD COLUMN IF NOT EXISTS stipend_inr_max INT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ip_internships_stipend_range_check'
  ) THEN
    ALTER TABLE ip_internships
      ADD CONSTRAINT ip_internships_stipend_range_check
      CHECK (
        stipend_inr_max IS NULL
        OR stipend_inr IS NULL
        OR stipend_inr_max >= stipend_inr
      );
  END IF;
END $$;
