/* eslint-disable no-console */
/**
 * Execute one SQL migration file against DATABASE_URL.
 * Fail-closed: any PostgreSQL error exits with code 1 and a clear FAIL banner.
 * Do not treat "Done" / exit 0 as success unless you see the OK banner.
 *
 * Usage: node scripts/db_exec_sql_file.js <relative-or-absolute-sql-path>
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { assertDbMigrateAllowed } = require('./assert-db-migrate-allowed');

assertDbMigrateAllowed(process.argv);

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    out[k] = v;
  }
  return out;
}

function readEnvFiles() {
  return { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
}

function getDbConfig() {
  const env = readEnvFiles();
  const rawUrl =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    env.DATABASE_URL ||
    env.SUPABASE_DATABASE_URL;
  if (!rawUrl) {
    throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL is required (.env or .env.local).');
  }
  return { connectionString: rawUrl, ssl: { rejectUnauthorized: false } };
}

function printFail(rel, err) {
  console.error('');
  console.error('=== FAIL: migration did NOT apply successfully ===');
  console.error(`File: ${rel}`);
  if (err && err.code) console.error(`PostgreSQL code: ${err.code}`);
  if (err && err.position) console.error(`Position: ${err.position}`);
  if (err && err.detail) console.error(`Detail: ${err.detail}`);
  if (err && err.hint) console.error(`Hint: ${err.hint}`);
  if (err && err.where) console.error(`Where: ${err.where}`);
  console.error(`Message: ${err && (err.message || err)}`);
  console.error('=== Do NOT continue — fix the SQL/DB state, then re-run ===');
  console.error('');
}

async function main() {
  const rel = process.argv[2];
  if (!rel) {
    throw new Error('Usage: node scripts/db_exec_sql_file.js <relative-sql-path>');
  }
  const sqlPath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');
  if (!sql.trim()) {
    throw new Error(`SQL file is empty: ${sqlPath}`);
  }

  const client = new Client(getDbConfig());
  const notices = [];
  client.on('notice', (msg) => {
    const text = msg.message || String(msg);
    notices.push(text);
    console.warn(`[pg notice] ${text}`);
  });

  await client.connect();
  try {
    console.log(`Executing SQL file: ${rel}`);
    // Do not wrap with BEGIN/COMMIT here: many migration files manage their own
    // transactions. An outer COMMIT after an inner COMMIT can print "success"
    // while leaving earlier errors easy to miss. One client.query(multi-SQL)
    // fails the whole batch if any statement errors (unless the file COMMITs early).
    await client.query(sql);
    console.log(`=== OK: ${rel} applied successfully (exit 0) ===`);
    if (notices.length) {
      console.log(`(server notices during run: ${notices.length})`);
    }
  } catch (e) {
    printFail(rel, e);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  // printFail already ran for query errors; still ensure non-zero exit
  if (!String(e && e.message || '').includes('migration did NOT')) {
    console.error('Failed:', e.message || e);
  }
  process.exit(1);
});
