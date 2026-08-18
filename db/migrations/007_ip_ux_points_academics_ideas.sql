-- Points-only UX: academics multi-row, personal website, commitment options,
-- feature-idea categories + priority. free_post_credits / application_allowance
-- columns may remain for legacy data but product spend paths use points only.

ALTER TABLE ip_candidates
  ADD COLUMN IF NOT EXISTS personal_website TEXT;

-- Migrate boolean ongoing_commitment → free-text choice labels
ALTER TABLE ip_candidates
  ADD COLUMN IF NOT EXISTS ongoing_commitment_choice TEXT;

UPDATE ip_candidates
SET ongoing_commitment_choice = CASE
  WHEN ongoing_commitment IS TRUE THEN 'other_internship'
  WHEN ongoing_commitment IS FALSE THEN 'none'
  ELSE NULL
END
WHERE ongoing_commitment_choice IS NULL;

CREATE TABLE IF NOT EXISTS ip_candidate_academics (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES ip_candidates(id) ON DELETE CASCADE,
  college TEXT,
  degree TEXT,
  specialization TEXT,
  study_status TEXT,
  graduation_year INT,
  cgpa TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_candidate_academics_cand
  ON ip_candidate_academics(candidate_id);

-- Seed one academic row from flat candidate columns when empty
INSERT INTO ip_candidate_academics (
  id, candidate_id, college, degree, specialization, study_status, graduation_year, cgpa, sort_order
)
SELECT
  'ip_acad_' || substr(md5(c.id || coalesce(c.college, '')), 1, 16),
  c.id,
  c.college,
  c.degree,
  c.specialization,
  c.study_status,
  c.graduation_year,
  c.cgpa::TEXT,
  0
FROM ip_candidates c
WHERE (c.college IS NOT NULL OR c.degree IS NOT NULL OR c.specialization IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM ip_candidate_academics a WHERE a.candidate_id = c.id);

CREATE TABLE IF NOT EXISTS ip_idea_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ip_idea_categories (id, name, sort_order) VALUES
  ('ip_ideacat_product', 'Product', 10),
  ('ip_ideacat_ux', 'UX / UI', 20),
  ('ip_ideacat_ops', 'Operations', 30),
  ('ip_ideacat_growth', 'Growth', 40),
  ('ip_ideacat_other', 'Other', 90)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE ip_feature_ideas
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES ip_idea_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority INT;

CREATE INDEX IF NOT EXISTS idx_ip_feature_ideas_category ON ip_feature_ideas(category_id);
CREATE INDEX IF NOT EXISTS idx_ip_feature_ideas_priority ON ip_feature_ideas(priority);
