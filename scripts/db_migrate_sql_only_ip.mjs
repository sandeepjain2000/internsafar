#!/usr/bin/env node
/**
 * SQL-ONLY migrations (001–039) — NO demo seed.
 *
 * Cursor / humans: prefer this name over the old "migrate-all".
 *
 *   npm run db:migrate:sql-only
 *
 * WHEN TO USE:
 *   - Database already has InternSafar demo users (core seed already ran), OR
 *   - You only need to apply SQL that does not require those users.
 *
 * WHEN NOT TO USE (fresh / empty RDS):
 *   → npm run deploy:fresh-aws-db
 *     (001–034 → IP_Reset_Core_Sample.js → 035–039)
 *
 * Migration 035 fails without demo candidates. Do not invent another order.
 *
 * Fail-closed: first non-zero child exit stops. Look for === OK === / === FAIL ===.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed.js');
assertDbMigrateAllowed(process.argv);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const manifestPath = path.join(__dirname, 'MIGRATION_MANIFEST.txt');
const runner = path.join(root, 'scripts', 'db_exec_sql_file.js');

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/);
  const files = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    files.push(trimmed);
  }
  if (files.length === 0) {
    throw new Error('Manifest is empty');
  }
  return files;
}

function assertSpawnOk(result, label) {
  if (result.error) {
    console.error(`\n=== FAIL: could not start migration runner for ${label} ===`);
    console.error(result.error.message || result.error);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`\n=== FAIL: ${label} killed by signal ${result.signal} ===`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n=== FAIL at ${label} (exit ${result.status ?? 'unknown'}) — stopping sql-only migrate ===`);
    console.error('Do NOT treat this run as successful. Fix the error, then re-run.');
    process.exit(result.status == null ? 1 : result.status);
  }
}

function main() {
  const files = loadManifest();
  console.log(`IP migrate sql-only: ${files.length} files from ${path.relative(root, manifestPath)}`);
  console.log('This does NOT run core seed. Fresh RDS? → npm run deploy:fresh-aws-db');
  console.log('Success = every file prints === OK === and this process exits 0.');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rel = path.join('db', 'migrations', file).replace(/\\/g, '/');
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      console.error(`=== FAIL: Missing migration file: ${rel} ===`);
      process.exit(1);
    }
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    const result = spawnSync(process.execPath, [runner, rel], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, IP_ALLOW_DB_MIGRATE: '1' },
    });
    assertSpawnOk(result, file);
  }

  console.log(`\n=== OK: All ${files.length} IP SQL-only migrations completed (exit 0) ===`);
}

main();
