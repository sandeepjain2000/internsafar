/* eslint-disable no-console */
/**
 * Live-data migration safety gate.
 *
 * Why: Once real users (not only testers) are on InternSafar, migrations must not
 * wipe rows or drop tables. Path B already blocks casual migrate; this gate blocks
 * destructive SQL in any *new* migration file even when IP_ALLOW_DB_MIGRATE=1.
 *
 * Legacy files that already shipped DELETE/DROP are allowlisted by basename only.
 * Do not add new names to the allowlist without an explicit user decision.
 *
 * Escape hatch (emergency only — prints a loud banner):
 *   IP_ALLOW_DESTRUCTIVE_SQL=1
 *   or --i-confirm-destructive-sql
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Basenames already in repo history with DELETE/DROP — grandfathered only. */
const LEGACY_DESTRUCTIVE_ALLOWLIST = new Set([
  '019_ip_ref_catalog_offer_fk.sql',
  '022_drop_ip_list_presets.sql',
  '023_ip_pipeline_fk_integrity.sql',
  '025_ratings_endorsements_required_internship.sql',
  '028_endorsement_referral_pref_integrity.sql',
  '035_ip_seed_candidate_academics.sql',
]);

/**
 * Patterns that remove user data or destroy tables/columns.
 * DROP CONSTRAINT / DROP INDEX remain allowed (schema reshape without wiping rows).
 */
const FORBIDDEN = [
  { id: 'DROP_TABLE', re: /\bDROP\s+TABLE\b/i },
  { id: 'DROP_DATABASE', re: /\bDROP\s+DATABASE\b/i },
  { id: 'DROP_SCHEMA', re: /\bDROP\s+SCHEMA\b/i },
  { id: 'DROP_COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { id: 'TRUNCATE', re: /\bTRUNCATE\b/i },
  { id: 'DELETE_FROM', re: /\bDELETE\s+FROM\b/i },
];

function argvAllowsDestructive(argv) {
  const a = argv || process.argv;
  return a.includes('--i-confirm-destructive-sql');
}

function envAllowsDestructive() {
  const v = String(process.env.IP_ALLOW_DESTRUCTIVE_SQL || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Remove --line and block comments so commented examples do not trip the scanner. */
function stripSqlComments(sql) {
  let out = String(sql || '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ');
  out = out.replace(/--[^\n\r]*/g, ' ');
  return out;
}

function findForbiddenHits(sql) {
  const cleaned = stripSqlComments(sql);
  const hits = [];
  for (const { id, re } of FORBIDDEN) {
    const m = cleaned.match(re);
    if (m) hits.push({ id, match: m[0] });
  }
  return hits;
}

function isLegacyAllowlisted(filePath) {
  return LEGACY_DESTRUCTIVE_ALLOWLIST.has(path.basename(filePath));
}

function printBlocked(rel, hits) {
  console.error('');
  console.error('=== BLOCKED: destructive migration SQL refused ===');
  console.error('');
  console.error('Why this exists:');
  console.error('  Real user data must survive upgrades. DELETE / DROP / TRUNCATE in');
  console.error('  migrations can wipe production rows. Prefer additive SQL only:');
  console.error('  ADD COLUMN, CREATE TABLE IF NOT EXISTS, UPDATE … WHERE, etc.');
  console.error('');
  console.error(`File: ${rel}`);
  for (const h of hits) {
    console.error(`  forbidden: ${h.id} (matched "${h.match}")`);
  }
  console.error('');
  console.error('How to proceed:');
  console.error('  1. Rewrite the migration without DELETE / DROP TABLE / DROP COLUMN / TRUNCATE.');
  console.error('  2. Emergency only (not for normal live upgrades):');
  console.error('       IP_ALLOW_DESTRUCTIVE_SQL=1  or  --i-confirm-destructive-sql');
  console.error('');
}

/**
 * @param {string} sqlPath absolute or relative path
 * @param {string[]} [argv]
 * @param {{ sql?: string }} [opts] pass sql to avoid re-read
 */
function assertMigrationSqlSafe(sqlPath, argv, opts) {
  const abs = path.isAbsolute(sqlPath) ? sqlPath : path.join(process.cwd(), sqlPath);
  const rel = path.relative(process.cwd(), abs) || abs;
  const base = path.basename(abs);

  if (isLegacyAllowlisted(abs)) {
    return { ok: true, legacy: true, file: base };
  }

  const sql = opts && opts.sql != null ? opts.sql : fs.readFileSync(abs, 'utf8');
  const hits = findForbiddenHits(sql);
  if (!hits.length) {
    return { ok: true, legacy: false, file: base };
  }

  if (envAllowsDestructive() || argvAllowsDestructive(argv)) {
    console.warn('');
    console.warn('=== WARNING: destructive SQL allowed by explicit override ===');
    console.warn(`File: ${rel}`);
    for (const h of hits) console.warn(`  ${h.id}: ${h.match}`);
    console.warn('This override must not be used as the normal live-upgrade path.');
    console.warn('');
    return { ok: true, overridden: true, hits, file: base };
  }

  printBlocked(rel, hits);
  process.exit(1);
}

/**
 * Scan every .sql under db/migrations. Fails if any non-allowlisted file is destructive.
 * Usage: node scripts/assert-migration-sql-safe.js [--scan-all]
 */
function scanAllMigrations(migrationsDir) {
  const dir = migrationsDir || path.join(process.cwd(), 'db', 'migrations');
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.sql'))
    .sort();
  const bad = [];
  const legacy = [];
  for (const file of files) {
    const abs = path.join(dir, file);
    const sql = fs.readFileSync(abs, 'utf8');
    const hits = findForbiddenHits(sql);
    if (!hits.length) continue;
    if (isLegacyAllowlisted(abs)) {
      legacy.push({ file, hits: hits.map((h) => h.id) });
      continue;
    }
    bad.push({ file, hits: hits.map((h) => h.id) });
  }
  return { files: files.length, legacy, bad };
}

if (require.main === module) {
  const scan = process.argv.includes('--scan-all') || process.argv.length <= 2;
  if (scan) {
    try {
      const result = scanAllMigrations();
      console.log(
        `Migration safety scan: ${result.files} files, ${result.legacy.length} legacy-allowlisted destructive, ${result.bad.length} blocked`,
      );
      for (const row of result.legacy) {
        console.log(`  legacy OK: ${row.file} (${row.hits.join(', ')})`);
      }
      if (result.bad.length) {
        for (const row of result.bad) {
          console.error(`  BLOCKED: ${row.file} (${row.hits.join(', ')})`);
        }
        console.error('');
        console.error('=== FAIL: non-legacy destructive migrations present ===');
        process.exit(1);
      }
      console.log('=== OK: migration safety scan passed ===');
      process.exit(0);
    } catch (e) {
      console.error('Failed:', e.message || e);
      process.exit(1);
    }
  }
}

module.exports = {
  LEGACY_DESTRUCTIVE_ALLOWLIST,
  FORBIDDEN,
  stripSqlComments,
  findForbiddenHits,
  isLegacyAllowlisted,
  assertMigrationSqlSafe,
  scanAllMigrations,
  argvAllowsDestructive,
  envAllowsDestructive,
};
