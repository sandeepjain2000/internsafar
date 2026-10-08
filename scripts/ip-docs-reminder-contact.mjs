#!/usr/bin/env node
/**
 * Backend-only control for the weekly employer documents reminder (`ip_employer_docs_reminders`).
 *
 *   npm run ip:docs-reminder -- --list
 *   npm run ip:docs-reminder -- --manual=<employer login email> [--at=2026-10-08]
 *       records that the employer was already emailed by hand; the next automated send waits a week from it
 *
 * Uses DATABASE_URL from the environment or .env.local / .env.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : '';
}

const CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS ip_employer_docs_reminders (
    employer_id TEXT PRIMARY KEY REFERENCES ip_employers(id) ON DELETE CASCADE,
    sent_count INT NOT NULL DEFAULT 0,
    first_sent_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ,
    manual_contact_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

async function main() {
  const list = process.argv.includes('--list');
  const manual = arg('manual').toLowerCase();
  const at = arg('at');
  if (!list && !manual) {
    console.error('Use --list or --manual=<employer login email> [--at=YYYY-MM-DD]');
    process.exit(1);
  }
  let atDate = new Date();
  if (at) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) throw new Error('--at must be YYYY-MM-DD');
    atDate = new Date(`${at}T12:00:00+05:30`);
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
    await client.query(CREATE_SQL);

    if (manual) {
      const emp = await client.query(
        `SELECT e.id, e.company_name, e.approval_status
         FROM ip_employers e JOIN ip_users u ON u.id = e.user_id
         WHERE lower(u.email) = $1 LIMIT 1`,
        [manual],
      );
      if (!emp.rowCount) throw new Error(`No employer with login email ${manual}`);
      const e = emp.rows[0];
      await client.query(
        `INSERT INTO ip_employer_docs_reminders (employer_id, manual_contact_at)
         VALUES ($1, $2)
         ON CONFLICT (employer_id) DO UPDATE SET manual_contact_at = EXCLUDED.manual_contact_at, updated_at = now()`,
        [e.id, atDate.toISOString()],
      );
      console.log(`manual contact recorded: ${manual} (${e.company_name}, ${e.approval_status}) at ${atDate.toISOString()}`);
    }

    if (list) {
      const res = await client.query(
        `SELECT u.email, e.company_name, e.approval_status, r.sent_count, r.last_sent_at, r.manual_contact_at, r.last_error
         FROM ip_employer_docs_reminders r
         JOIN ip_employers e ON e.id = r.employer_id
         JOIN ip_users u ON u.id = e.user_id
         ORDER BY coalesce(r.last_sent_at, r.manual_contact_at) DESC NULLS LAST`,
      );
      console.log(`tracked employers: ${res.rowCount}`);
      for (const r of res.rows) {
        console.log(
          `  ${r.email} | ${r.company_name} | ${r.approval_status} | sent ${r.sent_count}` +
            ` | last ${r.last_sent_at ? r.last_sent_at.toISOString() : '-'}` +
            ` | manual ${r.manual_contact_at ? r.manual_contact_at.toISOString() : '-'}` +
            (r.last_error ? ` | error: ${r.last_error}` : ''),
        );
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('=== FAIL ===', err?.message || err);
  process.exit(1);
});
