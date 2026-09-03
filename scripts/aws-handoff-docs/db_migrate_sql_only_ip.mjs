#!/usr/bin/env node
/**
 * Handoff runner — SQL ONLY (001–039). NO demo seed.
 *
 * Usage (from runner/) — must explicitly allow DB writes:
 *   IP_ALLOW_DB_MIGRATE=1 NODE_PATH=~/internship-portal/node_modules node db_migrate_sql_only_ip.mjs
 *
 * Path B (app update): do NOT run this. Do NOT set IP_ALLOW_DB_MIGRATE.
 *
 * Fresh / empty RDS: from the app folder run:
 *   IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db
 *
 * Fail-closed: === OK === / === FAIL === banners; exit 0 only on full success.
 * Gate: assert-db-migrate-allowed.js (also enforced by db_exec_sql_file.js).
 *
 * Loads DATABASE_URL from (first found):
 *   1. ../.env (handoff root)
 *   2. ../../internship-portal/.env
 *   3. process.env
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed.js');
assertDbMigrateAllowed(process.argv);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handoffRoot = path.join(__dirname, '..');
const migrationsDir = path.join(handoffRoot, 'migrations');
const manifestPath = path.join(__dirname, 'MIGRATION_MANIFEST.txt');
const runner = path.join(__dirname, 'db_exec_sql_file.js');

function loadEnv() {
  const candidates = [
    path.join(handoffRoot, '.env'),
    path.join(handoffRoot, '..', 'internship-portal', '.env'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`Loaded env from ${p}`);
      return;
    }
  }
  dotenv.config();
}

function loadManifest() {
  const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
  return lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function assertSpawnOk(result, label) {
  if (result.error) {
    console.error(`\n=== FAIL: could not start runner for ${label} ===`);
    console.error(result.error.message || result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`\n=== FAIL: ${label} killed by signal ${result.signal} ===`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n=== FAIL at ${label} (exit ${result.status ?? 'unknown'}) — stopping ===`);
    console.error('Do NOT treat this run as successful.');
    process.exit(result.status == null ? 1 : result.status);
  }
}

function main() {
  loadEnv();
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
    console.error('=== FAIL: DATABASE_URL is required ===');
    process.exit(1);
  }

  const files = loadManifest();
  console.log(`Handoff migrate sql-only: ${files.length} files`);
  console.log('Fresh RDS? cd ~/internship-portal && IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db');
  console.log('Success = every file prints === OK === and exit 0.');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const abs = path.join(migrationsDir, file);
    if (!fs.existsSync(abs)) {
      console.error(`=== FAIL: Missing: ${abs} ===`);
      process.exit(1);
    }
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    const result = spawnSync(process.execPath, [runner, abs], {
      cwd: handoffRoot,
      stdio: 'inherit',
      env: { ...process.env, IP_ALLOW_DB_MIGRATE: '1' },
    });
    assertSpawnOk(result, file);
  }
  console.log(`\n=== OK: All ${files.length} SQL-only migrations completed (exit 0) ===`);
}

main();
