/* eslint-disable no-console */
/**
 * One-shot: set SuperAdmin to support@placementhub.online using password from
 * coreaccountspass.json (gitignored).
 * Usage (from internship-portal): node scripts/set-superadmin-email.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const fs = require('fs');
const { SUPERADMIN_EMAIL, getCorePasswordForEmail } = require('./lib/ipCoreSampleConfig.js');

const NEW_EMAIL = SUPERADMIN_EMAIL;
const LEGACY = 'superadmin@internship.local';

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const PASSWORD = getCorePasswordForEmail(NEW_EMAIL);
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);

  const target = await client.query(`SELECT id, role, email FROM ip_users WHERE lower(email) = lower($1)`, [NEW_EMAIL]);
  const legacy = await client.query(`SELECT id, email FROM ip_users WHERE lower(email) = lower($1)`, [LEGACY]);

  if (target.rows[0]) {
    await client.query(
      `UPDATE ip_users SET role='superadmin', password_hash=$2, name=COALESCE(NULLIF(name,''),'Portal SuperAdmin'), active=true, updated_at=now() WHERE id=$1`,
      [target.rows[0].id, hash],
    );
    console.log('Updated existing SuperAdmin password_hash from coreaccountspass.json (value not printed)');
  } else if (legacy.rows[0]) {
    await client.query(
      `UPDATE ip_users SET email=$2, role='superadmin', password_hash=$3, name='Portal SuperAdmin', active=true, updated_at=now() WHERE id=$1`,
      [legacy.rows[0].id, NEW_EMAIL, hash],
    );
    console.log('Migrated legacy SuperAdmin email + password from JSON');
  } else {
    console.log('No SuperAdmin row found — create via seed/reset instead');
  }

  if (legacy.rows[0] && target.rows[0] && legacy.rows[0].id !== target.rows[0].id) {
    await client.query(`UPDATE ip_users SET active=false, updated_at=now() WHERE id=$1`, [legacy.rows[0].id]);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
