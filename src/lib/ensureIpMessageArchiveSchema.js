import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent per-user archive columns on ip_message_threads. */
export async function ensureIpMessageArchiveSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS candidate_archived_at TIMESTAMPTZ`);
  await query(`ALTER TABLE ip_message_threads ADD COLUMN IF NOT EXISTS employer_archived_at TIMESTAMPTZ`);
  schemaReady = true;
}
