import { query } from '@/lib/db';

let schemaReady = false;

/** One row per captcha that has been spent on a login / register / reset submit. */
export async function ensureIpCaptchaNonceSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_captcha_nonces (
      nonce TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  schemaReady = true;
}

/** @returns {Promise<boolean>} true the first time a nonce is spent, false on reuse. */
export async function consumeCaptchaNonce(nonce) {
  await ensureIpCaptchaNonceSchema();
  const result = await query(
    `INSERT INTO ip_captcha_nonces (nonce, expires_at)
     VALUES ($1, now() + interval '30 minutes')
     ON CONFLICT (nonce) DO NOTHING`,
    [nonce],
  );
  if (Math.random() < 0.02) {
    query(`DELETE FROM ip_captcha_nonces WHERE expires_at < now()`).catch(() => {});
  }
  return result.rowCount === 1;
}

export async function isCaptchaNonceUsed(nonce) {
  await ensureIpCaptchaNonceSchema();
  const result = await query(`SELECT 1 FROM ip_captcha_nonces WHERE nonce = $1`, [nonce]);
  return Boolean(result.rows[0]);
}
