#!/usr/bin/env node
/**
 * Fresh AWS RDS deploy: schema migrations → core demo seed → data migrations.
 *
 * Path C (fresh RDS) — must explicitly allow DB writes:
 *   IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db
 *   IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db -- --dry-run
 *
 * SQL only (demo users already exist):
 *   IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only
 *
 * Path B (app update): do NOT set IP_ALLOW_DB_MIGRATE; do NOT run this script.
 * Gate: scripts/assert-db-migrate-allowed.js (also enforced by db_exec_sql_file.js).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed.js');
assertDbMigrateAllowed(process.argv);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const manifestPath = path.join(__dirname, 'MIGRATION_MANIFEST.txt');
const runner = path.join(root, 'scripts', 'db_exec_sql_file.js');
const SPLIT_FILE = '035_ip_seed_candidate_academics.sql';
const DRY_RUN = process.argv.includes('--dry-run');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

function loadManifest() {
  const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
  const files = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    files.push(trimmed);
  }
  if (files.length === 0) throw new Error('Manifest is empty');
  return files;
}

function splitManifest(files) {
  const idx = files.indexOf(SPLIT_FILE);
  if (idx < 0) throw new Error(`Split point not found in manifest: ${SPLIT_FILE}`);
  return {
    beforeSeed: files.slice(0, idx),
    fromSeed: files.slice(idx),
  };
}

function assertSpawnOk(result, label) {
  if (result.error) {
    console.error(`\n=== FAIL: could not start process for ${label} ===`);
    console.error(result.error.message || result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`\n=== FAIL: ${label} killed by signal ${result.signal} ===`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n=== FAIL at ${label} (exit ${result.status ?? 'unknown'}) ===`);
    console.error('Do NOT treat this run as successful. Fix the error, then re-run.');
    process.exit(result.status == null ? 1 : result.status);
  }
}

function runMigration(file, index, total, label) {
  const rel = path.join('db', 'migrations', file).replace(/\\/g, '/');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`=== FAIL: Missing migration file: ${rel} ===`);
    process.exit(1);
  }
  console.log(`\n[${label} ${index}/${total}] ${file}`);
  if (DRY_RUN) return true;
  const result = spawnSync(process.execPath, [runner, rel], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, IP_ALLOW_DB_MIGRATE: '1' },
  });
  assertSpawnOk(result, file);
  return true;
}

async function verifyDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!rawUrl) {
    console.error('DATABASE_URL (or SUPABASE_DATABASE_URL) is required.');
    process.exit(1);
  }
  if (DRY_RUN) {
    console.log('DATABASE_URL: set (dry-run — skipping connectivity test)');
    return;
  }
  const url = new URL(rawUrl);
  const pool = new pg.Pool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: url.searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
  });
  try {
    await pool.query('SELECT 1');
    console.log('DATABASE_URL: connected');
  } finally {
    await pool.end();
  }
}

function runCoreSeed() {
  console.log('\n=== Core demo seed (IP_Reset_Core_Sample.js --yes) ===');
  if (DRY_RUN) {
    console.log('(dry-run — would run IP_Reset_Core_Sample.js --yes)');
    return;
  }
  const result = spawnSync(process.execPath, ['scripts/IP_Reset_Core_Sample.js', '--yes'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  assertSpawnOk(result, 'IP_Reset_Core_Sample.js');
}

async function printVerification() {
  const cfg = require('./lib/ipCoreSampleConfig.js');
  console.log('\n=== Verification ===');
  console.log('Demo accounts (password Admin@123):');
  console.log(`  Candidate:   ${cfg.CAND_BASE}`);
  console.log(`  Employer:    ${cfg.EMP_BASE}`);
  console.log(`  SuperAdmin:  ${cfg.SUPERADMIN_EMAIL}`);
  if (DRY_RUN) {
    console.log('(dry-run — skipping table counts)');
    return;
  }
  const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  const url = new URL(rawUrl);
  const pool = new pg.Pool({
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ssl: url.searchParams.get('sslmode') === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const tables = ['ip_users', 'ip_candidates', 'ip_employers', 'ip_candidate_academics'];
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
        console.log(`  ${t}: ${r.rows[0]?.n ?? 0}`);
      } catch (e) {
        console.log(`  ${t}: ERROR ${e.message}`);
      }
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const files = loadManifest();
  const { beforeSeed, fromSeed } = splitManifest(files);

  console.log('deploy:fresh-aws-db');
  console.log(`  Migrations before seed: ${beforeSeed.length} (001–034)`);
  console.log(`  Core seed: IP_Reset_Core_Sample.js`);
  console.log(`  Migrations after seed:  ${fromSeed.length} (035–039)`);
  if (DRY_RUN) console.log('  Mode: DRY RUN (no DB writes)\n');

  await verifyDatabaseUrl();

  console.log('\n=== Phase 1: schema migrations 001–034 ===');
  beforeSeed.forEach((file, i) => runMigration(file, i + 1, beforeSeed.length, 'schema'));

  runCoreSeed();

  console.log('\n=== Phase 3: data migrations 035–039 ===');
  fromSeed.forEach((file, i) => runMigration(file, i + 1, fromSeed.length, 'data'));

  await printVerification();
  console.log('\n=== OK: Fresh AWS DB deploy complete (exit 0) ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
