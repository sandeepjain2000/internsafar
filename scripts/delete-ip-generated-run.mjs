#!/usr/bin/env node
/**
 * InternSafar test-data deletion — two modes:
 *
 *   --mode=run            Delete one generated run ID (default)
 *   --mode=except-cores   Delete ALL users except the three CORE accounts
 *
 * Dry-run unless confirmed. Never changes core email / password / role.
 * See scripts/IP_TEST_DATA_GUIDE.md
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(appRoot, '.env.local') });
dotenv.config({ path: path.join(appRoot, '.env') });

const require = createRequire(import.meta.url);
const {
  PROTECTED_ACCOUNT_EMAILS,
  assertProtectedConfigValid,
  isProtectedEmail,
} = require('./lib/ipCoreSampleConfig.js');
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser.js');
const { ensureIpPipelineSchema } = require('./lib/ensureIpPipelineSchema.js');

function argFlag(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
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
  };
}

async function snapshotProtected(client) {
  const result = await client.query(
    `SELECT id, email, role, password_hash, name
     FROM ip_users WHERE lower(email) = ANY($1::text[])`,
    [PROTECTED_ACCOUNT_EMAILS],
  );
  return result.rows;
}

function assertProtectedUnchanged(before, after) {
  const byEmail = new Map(after.map((r) => [String(r.email).toLowerCase(), r]));
  for (const b of before) {
    const a = byEmail.get(String(b.email).toLowerCase());
    if (!a) throw new Error(`Core account missing after delete: ${b.email}`);
    if (a.id !== b.id) throw new Error(`Core id changed: ${b.email}`);
    if (a.role !== b.role) throw new Error(`Core role changed: ${b.email}`);
    if (a.password_hash !== b.password_hash) throw new Error(`Core password_hash changed: ${b.email}`);
    if (String(a.email).toLowerCase() !== String(b.email).toLowerCase()) {
      throw new Error(`Core email changed: ${b.email}`);
    }
  }
}

async function deleteByRun(client, { runId, confirm }) {
  const dryRun = !confirm;
  const run = await client.query(`SELECT * FROM ip_generated_runs WHERE run_id = $1`, [runId]);
  if (!run.rows[0]) {
    console.error(`No generated run found: ${runId}`);
    process.exit(2);
  }

  const users = await client.query(
    `SELECT id, email, role FROM ip_users WHERE generated_run_id = $1`,
    [runId],
  );
  for (const u of users.rows) {
    if (isProtectedEmail(u.email)) {
      throw new Error(`Abort: run ${runId} includes core email ${u.email}`);
    }
  }

  const report = {
    mode: 'run',
    runId,
    dryRun,
    users: users.rows.length,
    emails: users.rows.map((u) => u.email),
    coreEmailsUntouched: PROTECTED_ACCOUNT_EMAILS,
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, report }, null, 2));
    return;
  }

  const before = await snapshotProtected(client);
  const userIds = users.rows.map((u) => u.id);

  // hard-delete each user (own transactions) for full cascade
  const deleted = [];
  for (const u of users.rows) {
    const res = await hardDeleteIpUser(client, { userId: u.id, allowSuperadmin: false });
    if (!res.ok) throw new Error(res.error || `Failed deleting ${u.email}`);
    deleted.push(u.email);
  }

  await client.query(`DELETE FROM ip_generated_runs WHERE run_id = $1`, [runId]);

  const after = await snapshotProtected(client);
  assertProtectedUnchanged(before, after);

  console.log(
    JSON.stringify(
      {
        ok: true,
        deleted: true,
        mode: 'run',
        runId,
        usersDeleted: deleted.length,
        emailsDeleted: deleted,
        coresVerified: before.map((b) => ({ email: b.email, role: b.role })),
      },
      null,
      2,
    ),
  );
}

async function deleteExceptCores(client, { confirm }) {
  const dryRun = !confirm;
  const all = await client.query(`SELECT id, email, role FROM ip_users ORDER BY email`);
  const victims = all.rows.filter((u) => !isProtectedEmail(u.email));
  const cores = all.rows.filter((u) => isProtectedEmail(u.email));

  for (const email of PROTECTED_ACCOUNT_EMAILS) {
    if (!cores.some((c) => String(c.email).toLowerCase() === email)) {
      throw new Error(`Abort: core account not present in DB: ${email}`);
    }
  }

  const report = {
    mode: 'except-cores',
    dryRun,
    coresKept: cores.map((c) => ({ email: c.email, role: c.role })),
    usersToDelete: victims.length,
    sampleEmails: victims.slice(0, 30).map((v) => v.email),
  };

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, report }, null, 2));
    return;
  }

  const before = await snapshotProtected(client);
  const deleted = [];
  for (const u of victims) {
    const res = await hardDeleteIpUser(client, { userId: u.id, allowSuperadmin: false });
    if (!res.ok) {
      console.warn(`Skip/fail ${u.email}: ${res.error}`);
      continue;
    }
    deleted.push(u.email);
  }

  // Clear generated run registry (optional cleanup)
  await client.query(`DELETE FROM ip_generated_runs`).catch(() => {});

  const after = await snapshotProtected(client);
  assertProtectedUnchanged(before, after);

  console.log(
    JSON.stringify(
      {
        ok: true,
        deleted: true,
        mode: 'except-cores',
        usersDeleted: deleted.length,
        coresVerified: after.map((b) => ({ email: b.email, role: b.role })),
      },
      null,
      2,
    ),
  );
}

async function main() {
  assertProtectedConfigValid();
  const mode = arg('mode', 'run');
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL (or SUPABASE_DATABASE_URL) required');

  if (process.argv.includes('--help')) {
    console.log(`Usage:
  # Delete one generate run (dry-run)
  node scripts/delete-ip-generated-run.mjs --mode=run --run-id RUN_ID
  node scripts/delete-ip-generated-run.mjs --mode=run --confirm-generated-run RUN_ID

  # Delete everyone except the three core accounts (dry-run)
  node scripts/delete-ip-generated-run.mjs --mode=except-cores
  node scripts/delete-ip-generated-run.mjs --mode=except-cores --confirm-except-cores YES

See scripts/IP_TEST_DATA_GUIDE.md`);
    return;
  }

  const pool = new pg.Pool(parseUrl(dbUrl));
  const client = await pool.connect();
  try {
    await ensureIpPipelineSchema(client);
    if (mode === 'except-cores') {
      const token = argFlag('confirm-except-cores') || arg('confirm-except-cores', null);
      const confirm = String(token || '').toUpperCase() === 'YES';
      await deleteExceptCores(client, { confirm });
      return;
    }

    // run mode
    const runId = argFlag('confirm-generated-run') || argFlag('run-id') || arg('run-id', null);
    const confirm = Boolean(argFlag('confirm-generated-run'));
    if (!runId) {
      console.error('Missing --run-id or --confirm-generated-run RUN_ID');
      process.exit(1);
    }
    await deleteByRun(client, { runId, confirm });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
