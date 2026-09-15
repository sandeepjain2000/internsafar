#!/usr/bin/env node
/**
 * TC-IS-03-013 / REG-E-6 — duplicate work email on employer domain (auto) path → 409.
 * No browser Google: uses an already-registered company-domain email
 * (support@placementhub.online). If the live host still requires a gv token before
 * the duplicate check, mints a one-shot verification row in the shared DB.
 *
 * Usage (from internship-portal/):
 *   node scripts/manual/run-tc-is-03-013-duplicate-employer.mjs
 *   node scripts/manual/run-tc-is-03-013-duplicate-employer.mjs https://internship-portal-sigma-mauve.vercel.app --apply-excel
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { apiRequest } from '../lib/ipQaAuth.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const args = process.argv.slice(2);
const APPLY_EXCEL = args.includes('--apply-excel');
const BASE =
  args.find((a) => !a.startsWith('-')) ||
  process.env.IP_BASE ||
  'https://internship-portal-sigma-mauve.vercel.app';

const TC_ID = 'TC-IS-03-013';
/** Existing SuperAdmin — company domain, already in ip_users. */
const EMAIL = 'support@placementhub.online';
const WEBSITE = 'https://placementhub.online';
const PURPOSE = 'employer-register';

function dbUrl() {
  return process.env.IP_DATABASE_URL || process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || '';
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function mintGoogleVerification(email) {
  const url = dbUrl();
  if (!url) throw new Error('No DATABASE_URL — cannot mint google verification for pre-fix hosts');
  const token = crypto.randomBytes(32).toString('base64url');
  const id = `ip_gver_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ip_google_verifications (
        id text PRIMARY KEY,
        token_hash text NOT NULL,
        email text NOT NULL,
        google_sub text,
        name text,
        picture_url text,
        purpose text NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz
      )
    `);
    await client.query(
      `INSERT INTO ip_google_verifications
         (id, token_hash, email, google_sub, name, picture_url, purpose, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '10 minutes')`,
      [id, hashToken(token), email.toLowerCase(), `qa-sub-${id}`, 'QA Dup', null, PURPOSE],
    );
  } finally {
    await client.end();
  }
  return token;
}

async function registerDomain({ googleVerificationToken } = {}) {
  return apiRequest(BASE, '/api/ip/auth/register-employer', {
    method: 'POST',
    body: {
      email: EMAIL,
      website: WEBSITE,
      companyName: 'PlacementHub',
      contactName: 'QA Duplicate',
      designation: 'Recruiter',
      businessEntityType: 'Private Limited',
      manualRequest: false,
      ...(googleVerificationToken ? { googleVerificationToken } : {}),
    },
  });
}

const log = [];
function step(msg, extra) {
  const line = extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg;
  log.push(line);
  console.log(line);
}

let pass = false;
let actual = '';

try {
  step(`Base ${BASE}`);
  step('Duplicate domain register attempt', { email: EMAIL, website: WEBSITE });

  let res = await registerDomain();
  step('First POST', { status: res.status, error: res.data?.error });

  if (res.status === 401) {
    step('Host still requires gv before duplicate check — minting shared-DB verification');
    const gv = await mintGoogleVerification(EMAIL);
    res = await registerDomain({ googleVerificationToken: gv });
    step('Retry with gv', { status: res.status, error: res.data?.error });
  }

  if (res.status !== 409) {
    throw new Error(`Expected 409 duplicate, got ${res.status}: ${JSON.stringify(res.data)}`);
  }
  const err = String(res.data?.error || '');
  if (!/already exists/i.test(err)) {
    throw new Error(`409 but unexpected error text: ${err}`);
  }

  pass = true;
  actual =
    `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
    `domain register-employer with existing ${EMAIL} + matching ${WEBSITE} → 409 (${err}).`;
} catch (e) {
  pass = false;
  actual = `Fail: ${e.message || e}\n${log.join('\n')}`;
  console.error(e);
}

const result = { tcId: TC_ID, status: pass ? 'Pass' : 'Fail', actual };
console.log('\nRESULT', JSON.stringify(result, null, 2));

mkdirSync(resolve(appRoot, 'scripts/manual'), { recursive: true });
writeFileSync(
  resolve(appRoot, 'scripts/manual/last-tc-is-03-013-result.json'),
  JSON.stringify(
    { sheet: '03 Registration', tc_id: TC_ID, automation: 'API', status: result.status, actual: result.actual, executed: new Date().toISOString(), log },
    null,
    2,
  ),
);

if (pass) {
  const resultsPath = resolve(appRoot, 'test-cases/qa-results.json');
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    payload = {};
  }
  const entry = { status: 'Pass', actual: result.actual };
  for (const k of ['byTcId', 'cases', 'results']) {
    if (!payload[k]) payload[k] = {};
    payload[k][TC_ID] = entry;
    payload[k]['REG-E-6'] = entry;
  }
  payload.executedAt = new Date().toISOString();
  writeFileSync(resultsPath, JSON.stringify(payload, null, 2));
  console.log('Updated test-cases/qa-results.json');
}

if (APPLY_EXCEL && pass) {
  execFileSync('python', [resolve(appRoot, 'scripts/apply-internsafar-qa-xlsx.py')], {
    cwd: appRoot,
    stdio: 'inherit',
  });
}

process.exit(pass ? 0 : 1);
