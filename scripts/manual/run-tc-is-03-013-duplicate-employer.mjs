#!/usr/bin/env node
/**
 * TC-IS-03-013 / REG-E-6 — duplicate work email on employer auto path → 409.
 * Uses the existing test employer on the Free-email path with a real captcha
 * (password + captcha are checked before the duplicate lookup). Nothing is created.
 *
 * Usage (from internship-portal/):
 *   node scripts/manual/run-tc-is-03-013-duplicate-employer.mjs [baseUrl]
 *   node scripts/manual/run-tc-is-03-013-duplicate-employer.mjs https://internship-portal-sigma-mauve.vercel.app --apply-excel
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import { apiRequest, ensureQaTestAccounts, fetchLoginCaptcha, requireQaLogin } from '../lib/ipQaAuth.mjs';
import { applyQaResultsToWorkbook, recordQaResults } from '../lib/recordQaResults.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });
const require = createRequire(import.meta.url);
const { TEST_EMPLOYER } = require('../lib/ipTestAccountsConfig.js');

const args = process.argv.slice(2);
const APPLY_EXCEL = args.includes('--apply-excel');
const BASE =
  args.find((a) => !a.startsWith('-')) ||
  process.env.IP_BASE ||
  'https://internship-portal-sigma-mauve.vercel.app';

const TC_ID = 'TC-IS-03-013';
const EMAIL = TEST_EMPLOYER.email;

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
  // The duplicate must be an existing account: make sure the test employer exists and signs in.
  ensureQaTestAccounts(BASE);
  await requireQaLogin(BASE, 'employer');
  step('Duplicate Free-email register attempt', { email: EMAIL });

  const cap = await fetchLoginCaptcha(BASE);
  const res = await apiRequest(BASE, '/api/ip/auth/register-employer', {
    method: 'POST',
    body: {
      path: 'free_email',
      email: EMAIL,
      companyName: 'Duplicate Check Pvt Ltd',
      contactName: 'Rohit Malhotra',
      designation: 'HR Manager',
      businessEntityType: 'Private Limited',
      password: 'Admin@1234',
      captchaToken: cap.captchaToken,
      captchaAnswer: cap.captchaAnswer,
    },
  });
  step('POST', { status: res.status, error: res.data?.error });

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
    `Free-email register-employer with existing test employer ${EMAIL} → 409 (${err}).`;
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

const entry = { status: result.status, actual: result.actual };
recordQaResults({ [TC_ID]: entry, 'REG-E-6': entry }, { source: 'manual/run-tc-is-03-013' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();

process.exitCode = pass ? 0 : 1;
