#!/usr/bin/env node
/**
 * Dump ip_* table/column fingerprints for schema compare (no row data, no secrets).
 * Usage: node scripts/schema-fingerprint-ip.mjs
 * Reads DATABASE_URL from env / .env.local
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: resolve(appRoot, '.env'), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

// Redact host for label only
let hostLabel = 'unknown';
try {
  const u = new URL(url.replace(/^postgresql:/i, 'postgres:'));
  hostLabel = u.hostname.includes('neon')
    ? 'neon-local-or-vercel'
    : u.hostname.includes('rds.amazonaws.com')
      ? 'aws-rds'
      : u.hostname.split('.').slice(-3).join('.');
} catch {
  hostLabel = 'unparsed';
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const INTERESTING = [
  'email_verify_required',
  'email_verified_at',
  'registration_source',
  'email_soft_fail',
  'email_classification_summary',
  'email_classification_reasons',
  'review_status',
  'approval_status',
];

try {
  const tables = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name LIKE 'ip\\_%'
    ORDER BY table_name
  `);
  const cols = await pool.query(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name LIKE 'ip\\_%'
    ORDER BY table_name, ordinal_position
  `);

  const byTable = {};
  for (const r of cols.rows) {
    if (!byTable[r.table_name]) byTable[r.table_name] = [];
    byTable[r.table_name].push(`${r.column_name}:${r.data_type}`);
  }

  const interestingHits = cols.rows
    .filter((r) => INTERESTING.includes(r.column_name) || r.table_name === 'ip_employer_email_verifications')
    .map((r) => `${r.table_name}.${r.column_name}`);

  const out = {
    hostLabel,
    tableCount: tables.rows.length,
    tables: tables.rows.map((r) => r.table_name),
    interestingHits: [...new Set(interestingHits)].sort(),
    has_ip_employer_email_verifications: tables.rows.some(
      (r) => r.table_name === 'ip_employer_email_verifications',
    ),
    ip_users_email_verify_required: Boolean(
      byTable.ip_users?.some((c) => c.startsWith('email_verify_required:')),
    ),
    ip_users_email_verified_at: Boolean(
      byTable.ip_users?.some((c) => c.startsWith('email_verified_at:')),
    ),
    ip_employers_email_soft_fail: Boolean(
      byTable.ip_employers?.some((c) => c.startsWith('email_soft_fail:')),
    ),
    // Full column fingerprint per table (for diff)
    columns: byTable,
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await pool.end();
}
