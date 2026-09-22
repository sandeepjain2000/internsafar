#!/usr/bin/env node
/**
 * Hard-delete Internship Portal users used for AWS/manual testing whose
 * first name starts with a given prefix (default: "test").
 *
 * Matching is CASE-INSENSITIVE (Postgres ILIKE):
 *   test, Test1, TEST123, Testcase  → match
 *   contest, John test               → no match (prefix only)
 *
 * Roles:
 *   candidate → ip_candidates.first_name ILIKE 'test%'
 *   employer  → first token of ip_employers.contact_name ILIKE 'test%'
 *               (e.g. "Test1 Kumar" matches; "John test" does not)
 *
 * One Node script — works on Windows local, Vercel/Neon DB, and AWS Linux EC2
 * when DATABASE_URL points at that environment's Postgres.
 *
 * Usage:
 *   node scripts/hard-delete-ip-test-prefix-users.js --dry-run
 *   node scripts/hard-delete-ip-test-prefix-users.js --confirm
 *   node scripts/hard-delete-ip-test-prefix-users.js --prefix=test --dry-run
 *   npm run delete:ip-test-prefix -- --dry-run
 *   npm run delete:ip-test-prefix -- --confirm
 *
 * Safety:
 *   - dry-run is default if --confirm is omitted
 *   - core demo emails (ipCoreSampleConfig) are never deleted
 *   - superadmin role is never deleted
 *   - uses the same cascade as hard-delete-ip-user.js
 */

const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser');
const { isProtectedEmail, PROTECTED_ACCOUNT_EMAILS } = require('./lib/ipCoreSampleConfig');

const DEFAULT_PREFIX = 'test';

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    out[k] = v;
  }
  return out;
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    confirm: false,
    prefix: DEFAULT_PREFIX,
    help: false,
  };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a.startsWith('--prefix=')) out.prefix = a.slice('--prefix='.length);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Hard-delete ip_* users with first-name prefix (case-insensitive)

  node scripts/hard-delete-ip-test-prefix-users.js --dry-run
  node scripts/hard-delete-ip-test-prefix-users.js --confirm
  node scripts/hard-delete-ip-test-prefix-users.js --prefix=test --dry-run

Options:
  --dry-run     List matches only (default when --confirm omitted)
  --confirm     Actually delete (required for destructive run)
  --prefix=…    Case-insensitive prefix (default: "${DEFAULT_PREFIX}")

Candidates: ip_candidates.first_name ILIKE '<prefix>%'
Employers:  first word of ip_employers.contact_name ILIKE '<prefix>%'

Never deletes core protected emails or superadmin role.
`);
}

/**
 * @param {import('pg').Client} client
 * @param {string} prefix  case-insensitive; must be non-empty safe token
 */
async function findMatches(client, prefix) {
  // Refuse wildcards / empty — prefix is literal for ILIKE …%
  if (!prefix || /[%_]/.test(prefix)) {
    throw new Error('Invalid --prefix (must be non-empty and not contain % or _)');
  }
  const like = `${prefix}%`;

  const cand = await client.query(
    `SELECT u.id, u.email, u.role, c.first_name AS match_name, 'candidate.first_name' AS match_field
     FROM ip_users u
     JOIN ip_candidates c ON c.user_id = u.id
     WHERE u.role = 'candidate'
       AND c.first_name ILIKE $1
     ORDER BY u.email`,
    [like],
  );

  const emp = await client.query(
    `SELECT u.id, u.email, u.role,
            split_part(trim(both from coalesce(e.contact_name, '')), ' ', 1) AS match_name,
            'employer.contact_name_first_token' AS match_field
     FROM ip_users u
     JOIN ip_employers e ON e.user_id = u.id
     WHERE u.role = 'employer'
       AND split_part(trim(both from coalesce(e.contact_name, '')), ' ', 1) ILIKE $1
     ORDER BY u.email`,
    [like],
  );

  return [...cand.rows, ...emp.rows];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const prefix = String(args.prefix || DEFAULT_PREFIX);
  const wantDelete = Boolean(args.confirm) && !args.dryRun;

  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const connectionString =
    process.env.DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL missing in env / .env / .env.local');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const matches = await findMatches(client, prefix);
    const skipped = [];
    const targets = [];

    for (const row of matches) {
      if (row.role === 'superadmin') {
        skipped.push({ ...row, reason: 'superadmin_role' });
        continue;
      }
      if (isProtectedEmail(row.email)) {
        skipped.push({ ...row, reason: 'protected_core_email' });
        continue;
      }
      targets.push(row);
    }

    console.log(
      JSON.stringify(
        {
          prefix,
          caseSensitive: false,
          mode: wantDelete ? 'delete' : 'dry-run',
          matchCount: matches.length,
          willDelete: targets.length,
          skipped: skipped.length,
          protectedEmails: PROTECTED_ACCOUNT_EMAILS,
          targets: targets.map((t) => ({
            id: t.id,
            email: t.email,
            role: t.role,
            matchName: t.match_name,
            matchField: t.match_field,
          })),
          skippedRows: skipped.map((t) => ({
            id: t.id,
            email: t.email,
            role: t.role,
            matchName: t.match_name,
            reason: t.reason,
          })),
        },
        null,
        2,
      ),
    );

    if (!wantDelete) {
      console.log(
        `\nDry-run only. To delete ${targets.length} user(s), re-run with --confirm`,
      );
      process.exit(0);
    }

    if (!targets.length) {
      console.log('Nothing to delete.');
      process.exit(0);
    }

    const results = [];
    for (const t of targets) {
      try {
        const r = await hardDeleteIpUser(client, {
          userId: t.id,
          allowSuperadmin: false,
        });
        if (!r?.ok) {
          throw new Error(r?.error || 'hardDeleteIpUser returned not ok');
        }
        results.push({
          ok: true,
          id: t.id,
          email: t.email,
          role: t.role,
          matchName: t.match_name,
          deleted: r.deleted || true,
        });
        console.log(`DELETED ${t.role} ${t.email} (${t.match_name})`);
      } catch (err) {
        results.push({
          ok: false,
          id: t.id,
          email: t.email,
          role: t.role,
          error: err.message || String(err),
        });
        console.error(`FAILED ${t.email}: ${err.message || err}`);
      }
    }

    const failed = results.filter((r) => !r.ok).length;
    console.log(
      JSON.stringify(
        { done: true, deleted: results.length - failed, failed, results },
        null,
        2,
      ),
    );
    process.exit(failed ? 1 : 0);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
