-- Work-readiness extras + separate phone-hide toggle for candidate profile.
ALTER TABLE ip_candidates
  ADD COLUMN IF NOT EXISTS prior_experience TEXT,
  ADD COLUMN IF NOT EXISTS immediate_start BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS willing_to_relocate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_phone_until_shortlist BOOLEAN NOT NULL DEFAULT true;
