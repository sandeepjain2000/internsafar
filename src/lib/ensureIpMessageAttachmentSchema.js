import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent attachment columns on ip_messages. */
export async function ensureIpMessageAttachmentSchema() {
  if (schemaReady) return;
  await query(`ALTER TABLE ip_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
  await query(`ALTER TABLE ip_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT`);
  await query(`ALTER TABLE ip_messages ADD COLUMN IF NOT EXISTS attachment_size INT`);
  await query(`ALTER TABLE ip_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT`);
  schemaReady = true;
}
