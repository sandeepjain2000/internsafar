/* eslint-disable no-console */
/**
 * Hard-delete every *@internship.local user (cascade). Keeps real accounts.
 * Usage: node scripts/hard-delete-internship-local-users.js --confirm
 */
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser');

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
  const confirm = process.argv.includes('--confirm');
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const connectionString =
    process.env.DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL required');

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const found = await client.query(`
    SELECT id, email, role, active
    FROM ip_users
    WHERE lower(email) LIKE '%@internship.local'
    ORDER BY email
  `);
  console.log('Found @internship.local users:', found.rows.length);
  for (const row of found.rows) console.log(' -', row.email, row.role, 'active=' + row.active);

  if (!confirm) {
    console.log('Dry run only. Pass --confirm to delete.');
    await client.end();
    return;
  }

  for (const row of found.rows) {
    const result = await hardDeleteIpUser(client, {
      email: row.email,
      dryRun: false,
      allowSuperadmin: row.role === 'superadmin',
    });
    console.log(JSON.stringify({
      email: row.email,
      ok: result.ok,
      error: result.error || null,
      counts: result.counts || result.deleted || null,
    }));
  }

  const left = await client.query(`
    SELECT email, role FROM ip_users WHERE lower(email) LIKE '%@internship.local'
  `);
  console.log('Remaining @internship.local:', left.rows);

  const sa = await client.query(`
    SELECT email, role, active FROM ip_users WHERE lower(email) = 'placementhubsupport@gmail.com'
  `);
  console.log('SuperAdmin kept:', sa.rows);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
