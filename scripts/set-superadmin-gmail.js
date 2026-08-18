/* eslint-disable no-console */
/**
 * One-shot: set SuperAdmin to placementhubsupport@gmail.com / Admin@123
 * Usage (from internship-portal): node scripts/set-superadmin-gmail.js
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const fs = require('fs');

const NEW_EMAIL = 'placementhubsupport@gmail.com';
const LEGACY = 'superadmin@internship.local';
const PASSWORD = 'Admin@123';

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
      `UPDATE ip_users
       SET role = 'superadmin', password_hash = $2, name = 'Portal SuperAdmin', active = true, updated_at = now()
       WHERE id = $1`,
      [target.rows[0].id, hash],
    );
    console.log('Updated existing user to superadmin:', NEW_EMAIL);
    if (legacy.rows[0] && legacy.rows[0].id !== target.rows[0].id) {
      await client.query(`UPDATE ip_users SET active = false, updated_at = now() WHERE id = $1`, [legacy.rows[0].id]);
      console.log('Deactivated legacy:', LEGACY);
    }
  } else if (legacy.rows[0]) {
    await client.query(
      `UPDATE ip_users
       SET email = $2, role = 'superadmin', password_hash = $3, name = 'Portal SuperAdmin', active = true, updated_at = now()
       WHERE id = $1`,
      [legacy.rows[0].id, NEW_EMAIL, hash],
    );
    console.log('Migrated', LEGACY, '→', NEW_EMAIL);
  } else {
    const id = `ip_user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const code = `SA${String(Date.now()).slice(-6)}`;
    await client.query(
      `INSERT INTO ip_users (id, email, password_hash, role, name, points, free_post_credits,
        application_allowance, referral_code, profile_complete, active)
       VALUES ($1,$2,$3,'superadmin','Portal SuperAdmin',0,0,0,$4,true,true)`,
      [id, NEW_EMAIL, hash, code],
    );
    console.log('Created superadmin:', NEW_EMAIL, id);
  }

  const check = await client.query(
    `SELECT id, email, role, active FROM ip_users WHERE lower(email) = lower($1)`,
    [NEW_EMAIL],
  );
  console.log('Result:', check.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
