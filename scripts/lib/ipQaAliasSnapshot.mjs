/**
 * Save a real QA mailbox, remove it so a test can register or treat it as unknown,
 * then put the saved rows back. Local and Vercel only. Snapshot files stay on disk
 * until restore succeeds so a crashed run can be repaired with
 * `node scripts/qa-restore-alias-snapshots.mjs`.
 */
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pg from 'pg';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const { hardDeleteIpUser } = require('./hardDeleteIpUser.js');

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: path.join(appRoot, '.env'), quiet: true });

const SNAPSHOT_DIR = path.join(appRoot, 'scripts', '.qa-alias-snapshots');

const TABLE_SPECS = [
  ['ip_users', 'user'],
  ['ip_employers', 'user'],
  ['ip_employer_documents', 'employer'],
  ['ip_internships', 'employer'],
  ['ip_applications', 'internships'],
  ['ip_offers', 'employer'],
  ['ip_points_ledger', 'user'],
  ['ip_notifications', 'user'],
  ['ip_login_events', 'user'],
  ['ip_auth_sessions', 'user'],
  ['ip_password_resets', 'user'],
  ['ip_employer_email_verifications', 'user'],
  ['ip_employer_docs_reminders', 'employer'],
  ['ip_referrals', 'user'],
];

function dbUrl() {
  return process.env.IP_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
}

export function assertQaHost(base) {
  let host = '';
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    throw new Error(`Refusing alias snapshot: bad base URL ${base}`);
  }
  const ok = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
  if (!ok) throw new Error(`Refusing alias snapshot against ${host}. Local and Vercel only.`);
}

function fileFor(email) {
  const safe = String(email).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return path.join(SNAPSHOT_DIR, `${safe}.json`);
}

async function connect() {
  const url = dbUrl();
  if (!url) throw new Error('DATABASE_URL missing (.env.local)');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function selectRows(client, sql, params) {
  try {
    const r = await client.query(sql, params);
    return r.rows;
  } catch (e) {
    if (e.code === '42P01') return null;
    throw e;
  }
}

async function capture(client, email) {
  const users = await client.query(`SELECT * FROM ip_users WHERE lower(email) = lower($1)`, [email]);
  const user = users.rows[0] || null;
  if (!user) return { user: null, tables: {} };
  const employers = await client.query(`SELECT * FROM ip_employers WHERE user_id = $1`, [user.id]);
  const employer = employers.rows[0] || null;
  const internships = employer
    ? await client.query(`SELECT id FROM ip_internships WHERE employer_id = $1`, [employer.id])
    : { rows: [] };
  const internshipIds = internships.rows.map((r) => r.id);
  const tables = {};
  for (const [table, kind] of TABLE_SPECS) {
    let rows = null;
    if (kind === 'user') {
      if (table === 'ip_users') rows = [user];
      else if (table === 'ip_referrals') {
        rows = await selectRows(
          client,
          `SELECT * FROM ip_referrals WHERE referrer_user_id = $1 OR referred_user_id = $1`,
          [user.id],
        );
      } else rows = await selectRows(client, `SELECT * FROM ${table} WHERE user_id = $1`, [user.id]);
    } else if (kind === 'employer') {
      if (!employer) rows = [];
      else if (table === 'ip_employers') rows = [employer];
      else rows = await selectRows(client, `SELECT * FROM ${table} WHERE employer_id = $1`, [employer.id]);
    } else if (kind === 'internships') {
      if (!internshipIds.length) rows = [];
      else rows = await selectRows(client, `SELECT * FROM ${table} WHERE internship_id = ANY($1::text[])`, [internshipIds]);
    }
    if (rows) tables[table] = rows;
  }
  return { user, tables };
}

function writeSnapshot(email, payload) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const file = fileFor(email);
  writeFileSync(file, JSON.stringify(payload));
  return file;
}

async function undoReferralBonus(client, testUserId) {
  const bonus = await client.query(
    `SELECT id, user_id, delta FROM ip_points_ledger WHERE meta->>'referredUserId' = $1`,
    [testUserId],
  );
  for (const row of bonus.rows) {
    await client.query(`UPDATE ip_users SET points = points - $2 WHERE id = $1`, [row.user_id, Number(row.delta) || 0]);
    await client.query(`DELETE FROM ip_points_ledger WHERE id = $1`, [row.id]);
  }
}

async function removeCurrent(client, email, startedAt) {
  const found = await client.query(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [email]);
  const id = found.rows[0]?.id;
  if (id) {
    await undoReferralBonus(client, id);
    await hardDeleteIpUser(client, { userId: id, allowSuperadmin: false });
  }
  await client.query(
    `DELETE FROM ip_login_events
      WHERE lower(email) = lower($1) AND user_id IS NULL AND created_at >= $2`,
    [email, startedAt],
  );
  await client.query(
    `DELETE FROM ip_notifications
      WHERE created_at >= $2
        AND (position(lower($1) in lower(coalesce(body, ''))) > 0
          OR position(lower($1) in lower(coalesce(title, ''))) > 0)`,
    [email, startedAt],
  );
}

async function columnTypes(client, table) {
  const r = await client.query(
    `SELECT column_name, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return Object.fromEntries(r.rows.map((row) => [row.column_name, row.udt_name]));
}

function bindValue(udt, value) {
  if (value == null) return null;
  if (udt === 'json' || udt === 'jsonb') return JSON.stringify(value);
  return value;
}

async function insertRows(client, table, rows) {
  if (!rows?.length) return;
  const types = await columnTypes(client, table);
  const cols = Object.keys(rows[0]).filter((c) => types[c]);
  const colSql = cols.map((c) => `"${c}"`).join(', ');
  for (const row of rows) {
    const vals = cols.map((c) => bindValue(types[c], row[c]));
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(`INSERT INTO ${table} (${colSql}) VALUES (${ph})`, vals);
  }
}

export async function borrowAlias(email, base) {
  assertQaHost(base);
  const client = await connect();
  try {
    const captured = await capture(client, email);
    const startedAt = new Date().toISOString();
    const payload = { email: String(email).toLowerCase(), startedAt, existed: Boolean(captured.user), tables: captured.tables };
    const file = writeSnapshot(email, payload);
    if (captured.user) await hardDeleteIpUser(client, { userId: captured.user.id, allowSuperadmin: false });
    console.log(`Snapshot ${email} (${captured.user ? 'saved and removed' : 'was not an account'}) → ${path.basename(file)}`);
    return { email: payload.email, file, startedAt, existed: payload.existed };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function restoreAlias(handle) {
  if (!handle?.email) return { restored: false };
  const file = handle.file || fileFor(handle.email);
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const client = await connect();
  try {
    await removeCurrent(client, payload.email, payload.startedAt);
    if (payload.existed) {
      await client.query('BEGIN');
      try {
        for (const [table] of TABLE_SPECS) {
          if (payload.tables[table]) await insertRows(client, table, payload.tables[table]);
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    unlinkSync(file);
    console.log(`Restored ${payload.email}`);
    return { restored: true, email: payload.email };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Put columns back after an in-place edit. The account stays; it is not deleted. */
export async function withAliasState(email, base, fn) {
  assertQaHost(base);
  const client = await connect();
  try {
    const users = await client.query(`SELECT * FROM ip_users WHERE lower(email) = lower($1)`, [email]);
    const user = users.rows[0];
    if (!user) throw new Error(`${email} is not on this database`);
    const employers = await client.query(`SELECT * FROM ip_employers WHERE user_id = $1`, [user.id]);
    const employer = employers.rows[0] || null;
    try {
      return await fn({ user, employer });
    } finally {
      await updateRow(client, 'ip_users', user);
      if (employer) await updateRow(client, 'ip_employers', employer);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function updateRow(client, table, row) {
  const types = await columnTypes(client, table);
  const cols = Object.keys(row).filter((c) => c !== 'id' && types[c]);
  const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
  await client.query(
    `UPDATE ${table} SET ${sets} WHERE id = $${cols.length + 1}`,
    [...cols.map((c) => bindValue(types[c], row[c])), row.id],
  );
}

export async function restoreAllSnapshots() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const files = readdirSync(SNAPSHOT_DIR).filter((n) => n.endsWith('.json'));
  const out = [];
  for (const name of files) {
    const file = path.join(SNAPSHOT_DIR, name);
    const payload = JSON.parse(readFileSync(file, 'utf8'));
    out.push(await restoreAlias({ email: payload.email, file, startedAt: payload.startedAt }));
  }
  return out;
}
