import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent last_reminded_at on ip_offers for employer remind rate-limiting. */
export async function ensureIpOfferRemindSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_offers ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ`);
  schemaReady = true;
}
