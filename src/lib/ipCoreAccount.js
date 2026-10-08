import { query } from '@/lib/db';

let ready = false;

/**
 * `ip_users.is_core_account`: shared demo logins (core candidate / employer). Their password can
 * only be set from the backend (`scripts/ip-core-account.mjs`). UI password changes and reset
 * links still run every check and report success, but leave the stored password untouched.
 */
export async function ensureIpCoreAccountSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS is_core_account BOOLEAN NOT NULL DEFAULT false`);
  ready = true;
}

export async function isCoreAccount(userId, db = { query }) {
  const res = await db.query(`SELECT is_core_account FROM ip_users WHERE id = $1`, [userId]);
  return res.rows[0]?.is_core_account === true;
}
