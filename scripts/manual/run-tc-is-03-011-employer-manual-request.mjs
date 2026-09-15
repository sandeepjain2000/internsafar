#!/usr/bin/env node
/**
 * TC-IS-03-011 — employer Form / manual request: stores SA request; no login until created.
 * Fully API-automated (no Google OAuth).
 *
 * Usage (from internship-portal/):
 *   node scripts/manual/run-tc-is-03-011-employer-manual-request.mjs
 *   node scripts/manual/run-tc-is-03-011-employer-manual-request.mjs https://internship-portal-sigma-mauve.vercel.app
 *   node scripts/manual/run-tc-is-03-011-employer-manual-request.mjs --apply-excel
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, fetchLoginCaptcha } from '../lib/ipQaAuth.mjs';

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

const TC_ID = 'TC-IS-03-011';
const SA = { email: 'support@placementhub.online', password: 'Admin@123' };
const stamp = Date.now().toString(36);
const EMAIL = `lawsonlclintern+emp03011-${stamp}@gmail.com`;
const REG_PW = 'Admin@1234';
const COMPANY = `QA Manual Co ${stamp}`;

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

  const cap = await fetchLoginCaptcha(BASE);
  const reg = await apiRequest(BASE, '/api/ip/auth/register-employer', {
    method: 'POST',
    body: {
      manualRequest: true,
      email: EMAIL,
      companyName: COMPANY,
      contactName: 'Form QA Employer',
      designation: 'University Recruiter',
      password: REG_PW,
      reason: 'Designation: University Recruiter',
      businessEntityType: 'Private Limited',
      captchaToken: cap.captchaToken,
      captchaAnswer: cap.captchaAnswer,
    },
  });
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`Register failed ${reg.status}: ${JSON.stringify(reg.data)}`);
  }
  if (reg.data?.mode !== 'manual_request') {
    throw new Error(`Expected mode=manual_request, got ${JSON.stringify(reg.data)}`);
  }
  const requestId = reg.data?.requestId;
  if (!requestId) throw new Error('No requestId in response');
  step('Manual request submitted', { email: EMAIL, requestId, mode: reg.data.mode });

  // No ip_users row yet — credentials login must fail.
  const loginAttempt = await apiLogin(BASE, EMAIL, REG_PW);
  if (loginAttempt.ok) {
    throw new Error('Login succeeded before SuperAdmin created the employer account');
  }
  step('Login blocked before SA create', { ok: loginAttempt.ok });

  const saLogin = await apiLogin(BASE, SA.email, SA.password);
  if (!saLogin.ok) throw new Error('SuperAdmin login failed');

  const list = await apiRequest(BASE, '/api/ip/superadmin/requests?status=pending', {
    cookie: saLogin.cookie,
  });
  if (list.status !== 200) {
    throw new Error(`SA requests list failed ${list.status}: ${JSON.stringify(list.data)}`);
  }
  const items = list.data?.items || [];
  const found =
    items.find((r) => r.id === requestId) ||
    items.find((r) => String(r.contact_email || '').toLowerCase() === EMAIL.toLowerCase());
  if (!found) {
    throw new Error(`Pending request not listed for ${EMAIL} (requestId=${requestId})`);
  }
  step('SuperAdmin sees pending request', {
    id: found.id,
    status: found.status,
    company: found.company_name,
  });

  pass = true;
  actual =
    `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
    `POST register-employer manualRequest → mode=manual_request (${requestId}); ` +
    `login ${EMAIL} blocked; SA /superadmin/requests lists pending row.`;
} catch (e) {
  pass = false;
  actual = `Fail: ${e.message || e}\n${log.join('\n')}`;
  console.error(e);
}

const result = {
  tcId: TC_ID,
  status: pass ? 'Pass' : 'Fail',
  actual,
};
console.log('\nRESULT', JSON.stringify(result, null, 2));

const outDir = resolve(appRoot, 'scripts/manual');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, 'last-tc-is-03-011-result.json'),
  JSON.stringify(
    {
      sheet: '03 Registration',
      tc_id: TC_ID,
      automation: 'API',
      status: result.status,
      actual: result.actual,
      executed: new Date().toISOString(),
      log,
    },
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
    // Legacy ID for this case — keep in sync so apply does not re-Block via REG-E-4
    payload[k]['REG-E-4'] = entry;
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
