/**
 * Set core-account password_hash values from a local JSON file.
 * Never logs password values — only role/email/ok/fail and lengths.
 *
 * Usage (from internship-portal):
 *   node scripts/set-core-passwords-from-json.mjs --file="C:/path/coreaccountspass.json"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function readEnvFile(filename) {
  const envPath = path.join(root, filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    out[k] = v;
  }
  return out;
}

function argValue(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const ALLOWED = new Set([
  'lawsonlclintern+1@gmail.com',
  'placementhubsupport@gmail.com',
  'support@placementhub.online',
]);

async function main() {
  const file = argValue('file');
  if (!file) {
    console.error('Missing --file=path/to/coreaccountspass.json');
    process.exit(1);
  }
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error('File not found');
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const accounts = Array.isArray(json.accounts) ? json.accounts : [];
  if (accounts.length !== 3) {
    console.error(`Expected 3 accounts, got ${accounts.length}`);
    process.exit(1);
  }

  for (const a of accounts) {
    const email = String(a.email || '').trim().toLowerCase();
    const pw = String(a.newPassword || '');
    if (!ALLOWED.has(email)) {
      console.error(`Refusing non-core email: ${email}`);
      process.exit(1);
    }
    if (!pw || /^REPLACE_ME_/i.test(pw) || pw.length < 8) {
      console.error(`Invalid/placeholder password for role=${a.role} email=${email} len=${pw.length}`);
      process.exit(1);
    }
  }

  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  // Host only — never print full URL
  let host = 'unknown';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    /* ignore */
  }
  console.log(`db_host=${host}`);
  console.log('schema_migrate=false password_hash_update_only=true');

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const results = [];
  try {
    for (const a of accounts) {
      const email = String(a.email).trim().toLowerCase();
      const role = String(a.role || '');
      const pw = String(a.newPassword);
      const found = await client.query(
        `SELECT id, email, role, active FROM ip_users WHERE lower(email)=lower($1) LIMIT 1`,
        [email],
      );
      if (!found.rowCount) {
        results.push({ role, email, ok: false, error: 'user_not_found' });
        continue;
      }
      const user = found.rows[0];
      if (role && user.role !== role) {
        results.push({
          role,
          email,
          ok: false,
          error: `role_mismatch db=${user.role}`,
        });
        continue;
      }
      const hash = await bcrypt.hash(pw, 10);
      await client.query(
        `UPDATE ip_users SET password_hash=$1, updated_at=now() WHERE id=$2`,
        [hash, user.id],
      );
      const check = await client.query(`SELECT password_hash FROM ip_users WHERE id=$1`, [
        user.id,
      ]);
      const match = await bcrypt.compare(pw, check.rows[0].password_hash);
      results.push({
        role: user.role,
        email: user.email,
        active: user.active,
        ok: match === true,
        verified_bcrypt: match === true,
        pw_len: pw.length,
      });
    }
  } finally {
    await client.end();
  }

  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`=== FAIL: ${failed.length} account(s) not updated ===`);
    process.exit(1);
  }
  console.log('=== OK: core passwords updated (hashes only) ===');
}

main().catch((err) => {
  console.error('=== FAIL ===', err?.message || err);
  process.exit(1);
});
