import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent interview_at + stored meeting URL on ip_applications. */
export async function ensureIpApplicationInterviewSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_applications ADD COLUMN IF NOT EXISTS interview_meet_url TEXT`);
  schemaReady = true;
}
