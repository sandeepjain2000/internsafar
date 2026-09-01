#!/usr/bin/env node
/**
 * Run all IP migrations (001–038) in manifest order.
 * Usage: npm run db:migrate:all
 * Requires DATABASE_URL or SUPABASE_DATABASE_URL in .env / .env.local (or .env on EC2).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

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

function main() {
  const files = loadManifest();
  console.log(`IP migrate-all: ${files.length} files from ${path.relative(root, manifestPath)}`);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const rel = path.join('db', 'migrations', file).replace(/\\/g, '/');
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      console.error(`Missing migration file: ${rel}`);
      process.exit(1);
    }
    console.log(`\n[${i + 1}/${files.length}] ${file}`);
    const result = spawnSync(process.execPath, [runner, rel], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      console.error(`\nFailed at ${file} (exit ${result.status ?? 'unknown'})`);
      process.exit(result.status ?? 1);
    }
  }

  console.log(`\nAll ${files.length} IP migrations completed.`);
}

main();
