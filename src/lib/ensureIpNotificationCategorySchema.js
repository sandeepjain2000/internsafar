import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent category / meta / archive columns on ip_notifications. */
export async function ensureIpNotificationCategorySchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS category text DEFAULT 'system'`);
  await query(`ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await query(`ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`);
  schemaReady = true;
}
