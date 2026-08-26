import { query } from '@/lib/db';

let ensured = false;

export async function ensureIpCandidateProfileSchema() {
  if (ensured) return;
  await query(`
    ALTER TABLE ip_candidates
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS middle_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'India',
      ADD COLUMN IF NOT EXISTS phone_country_code TEXT DEFAULT '+91',
      ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
      ADD COLUMN IF NOT EXISTS telegram_handle TEXT,
      ADD COLUMN IF NOT EXISTS prior_experience TEXT,
      ADD COLUMN IF NOT EXISTS immediate_start BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS willing_to_relocate BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS hide_phone_until_shortlist BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS graduation_year INT,
      ADD COLUMN IF NOT EXISTS college TEXT,
      ADD COLUMN IF NOT EXISTS degree TEXT,
      ADD COLUMN IF NOT EXISTS cgpa NUMERIC(4,2),
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS resume_links JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
  await query(`
    ALTER TABLE ip_candidate_academics
      ADD COLUMN IF NOT EXISTS row_label TEXT
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS ip_email_change_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      old_email TEXT NOT NULL,
      new_email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  ensured = true;
}
