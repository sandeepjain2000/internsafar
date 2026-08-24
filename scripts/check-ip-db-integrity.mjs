#!/usr/bin/env node
/**
 * InternSafar database integrity checker (read-only).
 *
 *   npm run db:check-integrity
 *   scripts\check-ip-db-integrity.cmd
 *
 * Exit 0 if checks pass; exit 1 if any orphan / mismatch is found.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`InternSafar DB integrity (read-only)

  npm run db:check-integrity
  node scripts/check-ip-db-integrity.mjs
  scripts\\check-ip-db-integrity.cmd

Needs DATABASE_URL or SUPABASE_DATABASE_URL in .env.local.
Does not print the connection string.
`);
  process.exit(0);
}

function loadDbUrl() {
  return process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
}

function parseUrl(rawUrl) {
  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: { rejectUnauthorized: false },
    max: 1,
  };
}

async function main() {
  const dbUrl = loadDbUrl();
  if (!dbUrl) {
    console.error('DATABASE_URL (or SUPABASE_DATABASE_URL) is required.');
    process.exit(1);
  }

  const pool = new pg.Pool(parseUrl(dbUrl));
  const one = async (sql) => {
    const r = await pool.query(sql);
    return Number(r.rows[0]?.n || 0);
  };

  try {
    const report = {
      ok: true,
      offer_fk_present: false,
      offers_missing_application_id: 0,
      offers_orphan_application: 0,
      offers_candidate_or_internship_mismatch: 0,
      applications_missing_candidate: 0,
      applications_missing_internship: 0,
      messages_missing_thread: 0,
    };

    const fk = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'ip_offers_application_id_fkey' LIMIT 1`,
    );
    report.offer_fk_present = fk.rowCount > 0;

    report.offers_missing_application_id = await one(
      `SELECT count(*)::int AS n FROM ip_offers WHERE application_id IS NULL`,
    );
    report.offers_orphan_application = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      LEFT JOIN ip_applications a ON a.id = o.application_id
      WHERE a.id IS NULL`);
    report.offers_candidate_or_internship_mismatch = await one(`
      SELECT count(*)::int AS n FROM ip_offers o
      JOIN ip_applications a ON a.id = o.application_id
      WHERE o.candidate_id IS DISTINCT FROM a.candidate_id
         OR o.internship_id IS DISTINCT FROM a.internship_id`);
    report.applications_missing_candidate = await one(`
      SELECT count(*)::int AS n FROM ip_applications a
      LEFT JOIN ip_candidates c ON c.id = a.candidate_id WHERE c.id IS NULL`);
    report.applications_missing_internship = await one(`
      SELECT count(*)::int AS n FROM ip_applications a
      LEFT JOIN ip_internships i ON i.id = a.internship_id WHERE i.id IS NULL`);
    report.messages_missing_thread = await one(`
      SELECT count(*)::int AS n FROM ip_messages m
      LEFT JOIN ip_message_threads t ON t.id = m.thread_id WHERE t.id IS NULL`);

    const bad =
      !report.offer_fk_present ||
      report.offers_missing_application_id > 0 ||
      report.offers_orphan_application > 0 ||
      report.offers_candidate_or_internship_mismatch > 0 ||
      report.applications_missing_candidate > 0 ||
      report.applications_missing_internship > 0 ||
      report.messages_missing_thread > 0;

    report.ok = !bad;
    console.log(JSON.stringify(report, null, 2));
    if (bad) process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
