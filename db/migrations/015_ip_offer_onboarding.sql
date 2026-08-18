-- Per-offer onboarding + HR/mentor contacts filled by the employer (not invented on accept).
ALTER TABLE ip_offers
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS onboarding_instructions TEXT,
  ADD COLUMN IF NOT EXISTS mentor_name TEXT,
  ADD COLUMN IF NOT EXISTS hr_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS hr_contact_phone TEXT;
