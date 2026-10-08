#!/usr/bin/env node
/**
 * Backend-only control for core (shared demo) accounts — `ip_users.is_core_account`.
 * Flagged accounts ignore UI password changes and reset links (the UI still reports success),
 * so this script is the only way to change their password.
 *
 *   npm run ip:core-account -- --list
 *   npm run ip:core-account -- --mark=<email>        flag as core
 *   npm run ip:core-account -- --unmark=<email>      back to a normal account
 *   IP_CORE_NEW_PASSWORD=... npm run ip:core-account -- --set-password=<email>
 *
 * Uses DATABASE_URL from the environment or .env.local / .env. Never prints password values.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim().toLowerCase() : '';
}

function passwordMeetsRules(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

async function findUser(client, email) {
  const res = await client.query(
    `SELECT id, email, role, active, is_core_account FROM ip_users WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  if (!res.rowCount) throw new Error(`No user with email ${email}`);
  return res.rows[0];
}

async function main() {
  const list = process.argv.includes('--list');
  const mark = arg('mark');
  const unmark = arg('unmark');
  const setPassword = arg('set-password');
  if (!list && !mark && !unmark && !setPassword) {
    console.error('Use --list, --mark=<email>, --unmark=<email> or --set-password=<email>');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing (.env.local)');
  let host = 'unknown';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    /* ignore */
  }
  console.log(`db_host=${host}`);

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS is_core_account BOOLEAN NOT NULL DEFAULT false`,
    );

    for (const [email, value] of [[mark, true], [unmark, false]]) {
      if (!email) continue;
      const user = await findUser(client, email);
      await client.query(`UPDATE ip_users SET is_core_account = $2, updated_at = now() WHERE id = $1`, [
        user.id,
        value,
      ]);
      console.log(`${value ? 'marked core' : 'unmarked'}: ${user.email} (${user.role})`);
    }

    if (setPassword) {
      const pw = String(process.env.IP_CORE_NEW_PASSWORD || '');
      if (!passwordMeetsRules(pw)) {
        throw new Error(
          'IP_CORE_NEW_PASSWORD must be 8+ characters with an uppercase letter, a number and a special character',
        );
      }
      const user = await findUser(client, setPassword);
      await client.query(`UPDATE ip_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
        user.id,
        await bcrypt.hash(pw, 10),
      ]);
      const check = await client.query(`SELECT password_hash FROM ip_users WHERE id = $1`, [user.id]);
      if (!(await bcrypt.compare(pw, check.rows[0].password_hash))) throw new Error('Password check failed');
      console.log(`password set: ${user.email} (${user.role}, core=${user.is_core_account})`);
    }

    if (list) {
      const res = await client.query(
        `SELECT email, role, active FROM ip_users WHERE is_core_account = true ORDER BY role, email`,
      );
      console.log(`core accounts: ${res.rowCount}`);
      for (const r of res.rows) console.log(`  ${r.email} (${r.role}${r.active ? '' : ', inactive'})`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('=== FAIL ===', err?.message || err);
  process.exit(1);
});
