import { query } from '@/lib/db';

let ensured = false;

/**
 * Additive schema for student discovery features (prefs, PPO, listing reports).
 * Safe to call on every request (idempotent). Never drops/wipes data.
 */
export async function ensureIpStudentDiscoveryFeatures() {
  if (ensured) return;

  await query(`
    ALTER TABLE ip_candidates
      ADD COLUMN IF NOT EXISTS preferred_roles TEXT[] NOT NULL DEFAULT '{}'::text[]
  `);

  await query(`
    ALTER TABLE ip_internships
      ADD COLUMN IF NOT EXISTS offers_ppo BOOLEAN NOT NULL DEFAULT false
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS ip_listing_reports (
      id TEXT PRIMARY KEY,
      reporter_user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      internship_id TEXT REFERENCES ip_internships(id) ON DELETE SET NULL,
      employer_id TEXT REFERENCES ip_employers(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT REFERENCES ip_users(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS ip_listing_reports_status_idx
      ON ip_listing_reports (status, created_at DESC)
  `);

  ensured = true;
}
