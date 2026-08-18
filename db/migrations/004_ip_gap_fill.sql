-- Gap-fill: saved internships, LinkedIn promotions, internship completion
-- Provisional points conversion is application logic (see src/lib/pointsEconomy.js)

CREATE TABLE IF NOT EXISTS ip_saved_internships (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES ip_candidates(id) ON DELETE CASCADE,
  internship_id TEXT NOT NULL REFERENCES ip_internships(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, internship_id)
);

CREATE INDEX IF NOT EXISTS ip_saved_internships_candidate_idx ON ip_saved_internships(candidate_id);

CREATE TABLE IF NOT EXISTS ip_linkedin_promotions (
  id TEXT PRIMARY KEY,
  employer_id TEXT NOT NULL REFERENCES ip_employers(id) ON DELETE CASCADE,
  internship_id TEXT NOT NULL REFERENCES ip_internships(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'failed', 'fast_track_pending', 'rewarded')),
  share_url TEXT,
  claimed_post_url TEXT,
  points_awarded INT NOT NULL DEFAULT 0,
  credits_awarded INT NOT NULL DEFAULT 0,
  review_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_linkedin_promotions_employer_idx ON ip_linkedin_promotions(employer_id);
CREATE INDEX IF NOT EXISTS ip_linkedin_promotions_status_idx ON ip_linkedin_promotions(status);

ALTER TABLE ip_applications
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT;

ALTER TABLE ip_employer_documents
  ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Expand application status values used by completion/hiring flow where needed
-- (existing free-text statuses remain valid)
