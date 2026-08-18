-- Form registration fields + SuperAdmin allow/reject queue support
ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'legacy';
ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS form_approval_status text;

COMMENT ON COLUMN ip_users.registration_source IS 'legacy | google | form | domain';
COMMENT ON COLUMN ip_users.form_approval_status IS 'pending | approved | rejected — set for form signups';

ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS contact_designation text;
ALTER TABLE ip_employer_requests ADD COLUMN IF NOT EXISTS password_hash text;
