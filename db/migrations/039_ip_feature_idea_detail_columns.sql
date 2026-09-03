-- Feature idea detail columns (matches runtime ensures in ensureIpFeatureIdeaBoardSchema / ensureIpFeatureIdeaTriageSchema)
ALTER TABLE ip_feature_ideas
  ADD COLUMN IF NOT EXISTS problem TEXT,
  ADD COLUMN IF NOT EXISTS solution TEXT,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;
