-- Indexes for admin audit filters / pagination (PH-aligned ergonomics, ism_* only).
CREATE INDEX IF NOT EXISTS idx_ism_audit_at_desc ON ism_audit_logs (at DESC);
CREATE INDEX IF NOT EXISTS idx_ism_audit_domain ON ism_audit_logs (domain);
CREATE INDEX IF NOT EXISTS idx_ism_audit_action ON ism_audit_logs (action);
