/**
 * Simulate clicking the core employer's current unsubscribe token → PENDING.
 * Run: node scripts/simulate-unsub-click-core-employer.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const libDir = path.join(projectRoot, 'src', 'lib');
const CORE_EMPLOYER = 'placementhubsupport@gmail.com';

function readEnvFile(filename) {
  const envPath = path.join(projectRoot, filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
}

function rewriteAliases(source) {
  return source.replace(/'@\/lib\/([^']+)'/g, (_m, name) => {
    const file = /\.[a-z]+$/i.test(name) ? name : `${name}.js`;
    return `'${pathToFileURL(path.join(libDir, file)).href}'`;
  });
}

const tmpDir = fs.mkdtempSync(path.join(projectRoot, '.unsub-click-'));
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  fs.writeFileSync(
    path.join(tmpDir, 'u.mjs'),
    rewriteAliases(fs.readFileSync(path.join(libDir, 'ipEmailUnsubscribe.js'), 'utf8')),
  );
  const unsub = await import(pathToFileURL(path.join(tmpDir, 'u.mjs')).href);
  await client.connect();
  const db = { query: (t, p) => client.query(t, p) };
  const tok = (
    await client.query(`SELECT token FROM ip_email_unsubscribe_tokens WHERE email = $1 LIMIT 1`, [
      CORE_EMPLOYER.toLowerCase(),
    ])
  ).rows[0]?.token;
  if (!tok) {
    console.error('NO_TOKEN for', CORE_EMPLOYER);
    process.exit(1);
  }
  const first = await unsub.recordUnsubscribeRequest(tok, db);
  const second = await unsub.recordUnsubscribeRequest(tok, db);
  console.log(
    JSON.stringify(
      {
        email: CORE_EMPLOYER,
        first: { ok: first.ok, status: first.status, duplicate: first.duplicate, id: first.id },
        second: { ok: second.ok, duplicate: second.duplicate, sameId: second.id === first.id },
      },
      null,
      2,
    ),
  );
} finally {
  await client.end().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
