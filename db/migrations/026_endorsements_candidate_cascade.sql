-- If a candidate is deleted, remove their endorsements (do not leave orphan certificates).
ALTER TABLE ip_endorsements DROP CONSTRAINT IF EXISTS ip_endorsements_candidate_id_fkey;
ALTER TABLE ip_endorsements
  ADD CONSTRAINT ip_endorsements_candidate_id_fkey
  FOREIGN KEY (candidate_id) REFERENCES ip_candidates(id) ON DELETE CASCADE;
