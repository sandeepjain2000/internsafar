/**
 * Live DB smoke: persist token → record PENDING → de-dupe → list.
 * Does not send real email. Run: node scripts/smoke-ip-email-unsubscribe-live.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const libDir = path.join(projectRoot, 'src', 'lib');

function readEnvFile(filename) {
  const envPath = path.join(projectRoot, filename);
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

const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('FAIL: DATABASE_URL missing');
  process.exit(1);
}

function rewriteAliases(source) {
  return source.replace(/'@\/lib\/([^']+)'/g, (_m, name) => {
    const file = /\.[a-z]+$/i.test(name) ? name : `${name}.js`;
    return `'${pathToFileURL(path.join(libDir, file)).href}'`;
  });
}

const tmpDir = fs.mkdtempSync(path.join(projectRoot, '.unsub-live-'));
const unsubPath = path.join(tmpDir, 'ipEmailUnsubscribe.mjs');
fs.writeFileSync(
  unsubPath,
  rewriteAliases(fs.readFileSync(path.join(libDir, 'ipEmailUnsubscribe.js'), 'utf8')),
);
const unsub = await import(pathToFileURL(unsubPath).href);
const format = await import(pathToFileURL(path.join(libDir, 'ipEmailUnsubscribeFormat.js')).href);

const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const db = {
  query: (text, params) => client.query(text, params),
};

const smokeEmail = `unsub-smoke+${Date.now()}@example.com`;

try {
  const token = await unsub.getOrCreateUnsubscribeToken(smokeEmail, undefined, db);
  assert.ok(format.isValidUnsubscribeToken(token), 'token format');
  const url = format.buildUnsubscribeUrl('http://localhost:3000', token);
  assert.match(url, /\/unsubscribe\?token=/);
  assert.ok(!url.toLowerCase().includes(smokeEmail));

  const first = await unsub.recordUnsubscribeRequest(token, db);
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.status, 'PENDING');
  assert.equal(first.email, smokeEmail.toLowerCase());

  const second = await unsub.recordUnsubscribeRequest(token, db);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.id, first.id);

  const pending = await unsub.listPendingUnsubscribeRequests({ limit: 50 }, db);
  assert.ok(pending.some((r) => r.id === first.id && r.status === 'PENDING'));

  // Cleanup smoke rows so shared DB stays tidy
  await client.query(`DELETE FROM ip_email_unsubscribe_requests WHERE email = $1`, [
    smokeEmail.toLowerCase(),
  ]);
  await client.query(`DELETE FROM ip_email_unsubscribe_tokens WHERE email = $1`, [
    smokeEmail.toLowerCase(),
  ]);

  console.log('OK: live unsubscribe token + PENDING create/de-dupe + list');
} finally {
  await client.end().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
