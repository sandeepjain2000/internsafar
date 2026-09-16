/**
 * Diagnose: does coreaccountspass.json match DB hashes?
 * Never prints password values — only booleans / lengths / host.
 *
 * Usage:
 *   node scripts/diagnose-core-passwords.mjs --file=PATH [--database-url=URL]
 *   (default DATABASE_URL from .env / .env.local)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readEnv(file) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

function arg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

const file = arg('file') || path.join(root, '..', 'coreaccountspass.json');
const env = { ...readEnv('.env'), ...readEnv('.env.local') };
const url = arg('database-url') || process.env.DATABASE_URL || env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}
let host = '?';
try {
  host = new URL(url).hostname;
} catch {
  /* ignore */
}
console.log(`db_host=${host}`);
console.log(`json_file_exists=${fs.existsSync(file)}`);

const json = JSON.parse(fs.readFileSync(file, 'utf8'));
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const a of json.accounts || []) {
    const email = String(a.email || '').trim();
    const pw = String(a.newPassword || a.password || '');
    const r = await client.query(
      `SELECT role, active, length(password_hash)::int AS hash_len, password_hash, updated_at
       FROM ip_users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    if (!r.rowCount) {
      console.log(JSON.stringify({ email, found: false }));
      continue;
    }
    const row = r.rows[0];
    const jsonMatch = await bcrypt.compare(pw, row.password_hash);
    const oldMatch = await bcrypt.compare('Admin@123', row.password_hash);
    console.log(
      JSON.stringify({
        role: row.role,
        email,
        active: row.active,
        json_pw_matches: jsonMatch,
        old_Admin123_matches: oldMatch,
        pw_len: pw.length,
        hash_len: row.hash_len,
        updated_at: row.updated_at,
      }),
    );
  }
} finally {
  await client.end();
}
