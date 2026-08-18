import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent category column on ip_notifications. */
export async function ensureIpNotificationCategorySchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS category text DEFAULT 'system'`);
  await query(`ALTER TABLE ip_notifications ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`);
  schemaReady = true;
}
