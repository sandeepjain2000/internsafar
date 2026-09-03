/* eslint-disable no-console */
/**
 * Hard gate for any script that writes schema/data via SQL migrate or core seed.
 *
 * Why: Cursor once ran a DB migrate during a Path B app-only deploy (RDS unchanged)
 * and treated a failed SQL run as success. Path B must never touch the database.
 *
 * How to allow (Path C / intentional SQL only — pick one):
 *   IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db
 *   IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only
 *   node scripts/… --i-confirm-db-write
 *   node scripts/deploy-fresh-aws-db.mjs --path-c-fresh-rds
 *   node scripts/db_migrate_sql_only_ip.mjs --sql-only-existing-users
 *
 * Path B (app update): do NOT set the env, do NOT pass these flags, do NOT run migrate.
 */
'use strict';

function argvHasConfirm(argv) {
  const a = argv || process.argv;
  return (
    a.includes('--i-confirm-db-write') ||
    a.includes('--path-c-fresh-rds') ||
    a.includes('--sql-only-existing-users')
  );
}

function envAllows() {
  const v = String(process.env.IP_ALLOW_DB_MIGRATE || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function printBlockedAndExit() {
  console.error('');
  console.error('=== BLOCKED: database migrate/seed refused ===');
  console.error('');
  console.error('Why this exists:');
  console.error('  A Cursor agent ran a DB migration during Path B (app code update only).');
  console.error('  Path B must swap app + build + PM2 only — RDS must stay untouched.');
  console.error('  The agent also missed SQL failures (now fail-closed with === FAIL ===).');
  console.error('');
  console.error('How it is stopped in code:');
  console.error('  scripts/assert-db-migrate-allowed.js refuses unless you explicitly allow.');
  console.error('  db_exec_sql_file.js and deploy/sql-only orchestrators call this gate first.');
  console.error('');
  console.error('How to allow intentionally (Path C / SQL-only when demo users exist):');
  console.error('  IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db');
  console.error('  IP_ALLOW_DB_MIGRATE=1 npm run db:migrate:sql-only');
  console.error('  (or pass --path-c-fresh-rds / --sql-only-existing-users / --i-confirm-db-write)');
  console.error('');
  console.error('Path B app update: do NOT set IP_ALLOW_DB_MIGRATE and do NOT run migrate.');
  console.error('');
  process.exit(1);
}

function assertDbMigrateAllowed(argv) {
  if (envAllows() || argvHasConfirm(argv)) {
    return;
  }
  printBlockedAndExit();
}

module.exports = {
  assertDbMigrateAllowed,
  envAllows,
  argvHasConfirm,
};
