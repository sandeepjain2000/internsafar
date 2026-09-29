-- Offers closed by an employer status change are 'withdrawn' ('expired' means the deadline passed).
-- Widens ip_offers_status_check only; every existing row already satisfies the new set. No blank-fill needed.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ip_offers_status_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%withdrawn%'
  ) THEN
    ALTER TABLE ip_offers DROP CONSTRAINT ip_offers_status_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_status_check') THEN
    ALTER TABLE ip_offers ADD CONSTRAINT ip_offers_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn'));
  END IF;
END $$;
