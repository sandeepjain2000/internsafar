/**
 * Unit checks for assert-migration-sql-safe (no DB required).
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  findForbiddenHits,
  isLegacyAllowlisted,
  scanAllMigrations,
  LEGACY_DESTRUCTIVE_ALLOWLIST,
} = require('./assert-migration-sql-safe.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

assert.ok(findForbiddenHits('SELECT 1').length === 0, 'clean SQL ok');
assert.ok(findForbiddenHits('ALTER TABLE t DROP CONSTRAINT IF EXISTS c').length === 0, 'DROP CONSTRAINT allowed');
assert.ok(findForbiddenHits('DROP INDEX IF EXISTS x').length === 0, 'DROP INDEX allowed');
assert.ok(findForbiddenHits('DELETE FROM ip_users').some((h) => h.id === 'DELETE_FROM'), 'DELETE blocked');
assert.ok(findForbiddenHits('DROP TABLE IF EXISTS ip_x').some((h) => h.id === 'DROP_TABLE'), 'DROP TABLE blocked');
assert.ok(findForbiddenHits('ALTER TABLE t DROP COLUMN c').some((h) => h.id === 'DROP_COLUMN'), 'DROP COLUMN blocked');
assert.ok(findForbiddenHits('TRUNCATE ip_users').some((h) => h.id === 'TRUNCATE'), 'TRUNCATE blocked');
assert.ok(
  findForbiddenHits('-- DELETE FROM ip_users\nSELECT 1').length === 0,
  'commented DELETE ignored',
);

assert.ok(isLegacyAllowlisted(path.join(migrationsDir, '022_drop_ip_list_presets.sql')));
assert.ok(!isLegacyAllowlisted(path.join(migrationsDir, '039_ip_feature_idea_detail_columns.sql')));

const scan = scanAllMigrations(migrationsDir);
assert.strictEqual(scan.bad.length, 0, `unexpected non-legacy destructive: ${JSON.stringify(scan.bad)}`);
assert.ok(scan.legacy.length >= 1, 'expected some legacy allowlisted files');
for (const name of LEGACY_DESTRUCTIVE_ALLOWLIST) {
  const abs = path.join(migrationsDir, name);
  assert.ok(fs.existsSync(abs), `missing legacy allowlisted file ${name}`);
}

// Simulated new migration with DELETE must be reported as bad when not allowlisted
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ip-mig-safe-'));
fs.writeFileSync(path.join(tmpDir, '040_bad_wipe.sql'), 'DELETE FROM ip_users;\n');
fs.writeFileSync(path.join(tmpDir, '041_good.sql'), 'ALTER TABLE ip_users ADD COLUMN IF NOT EXISTS x text;\n');
const tmpScan = scanAllMigrations(tmpDir);
assert.strictEqual(tmpScan.bad.length, 1, 'temp wipe file should be blocked');
assert.strictEqual(tmpScan.bad[0].file, '040_bad_wipe.sql');
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('=== OK: migration SQL safety unit checks passed ===');
