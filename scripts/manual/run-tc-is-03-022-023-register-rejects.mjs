#!/usr/bin/env node
/**
 * TC-IS-03-022 + TC-IS-03-023 — registration rejects that do NOT need live Google OAuth.
 *
 * 022: candidate register rejects non-Gmail email (API gate before OAuth).
 * 023: employer domain path rejects personal @gmail.com (consumer-domain gate before OAuth).
 *
 * Usage:
 *   node scripts/manual/run-tc-is-03-022-023-register-rejects.mjs
 *   node scripts/manual/run-tc-is-03-022-023-register-rejects.mjs https://internship-portal-sigma-mauve.vercel.app --apply-excel
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { apiRequest, fetchLoginCaptcha } from '../lib/ipQaAuth.mjs';

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

const stamp = Date.now().toString(36);
const results = {};

function step(id, msg, extra) {
  const line = extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg;
  console.log(`[${id}] ${line}`);
}

async function run022() {
  const id = 'TC-IS-03-022';
  const email = `qa.nongmail.${stamp}@yahoo.com`;
  // Form path hits the same isGmailAddress gate without needing Google.
  const cap = await fetchLoginCaptcha(BASE);
  const res = await apiRequest(BASE, '/api/ip/auth/register-candidate', {
    method: 'POST',
    body: {
      path: 'form',
      email,
      name: 'Non Gmail QA',
      password: 'Admin@1234',
      university: 'QA University',
      graduationYear: 2027,
      captchaToken: cap.captchaToken,
      captchaAnswer: cap.captchaAnswer,
    },
  });
  step(id, 'register non-gmail', { status: res.status, error: res.data?.error });
  const ok =
    res.status === 400 &&
    /gmail/i.test(String(res.data?.error || '')) &&
    /not accepted|only gmail/i.test(String(res.data?.error || ''));
  if (!ok) throw new Error(`022 expected 400 Gmail-only, got ${res.status}: ${JSON.stringify(res.data)}`);
  results[id] = {
    status: 'Pass',
    actual:
      `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
      `register-candidate ${email} → 400 (${res.data.error}). No Google OAuth required.`,
  };
}

async function run023() {
  const id = 'TC-IS-03-023';
  // Matching gmail.com host + @gmail.com passes domain-match, then consumer gate.
  const email = `qa.personal.${stamp}@gmail.com`;
  const res = await apiRequest(BASE, '/api/ip/auth/register-employer', {
    method: 'POST',
    body: {
      email,
      website: 'https://gmail.com',
      companyName: 'Personal Gmail Co',
      contactName: 'QA Personal',
      designation: 'Recruiter',
      businessEntityType: 'Private Limited',
      manualRequest: false,
    },
  });
  step(id, 'domain register personal gmail', { status: res.status, error: res.data?.error });
  const err = String(res.data?.error || '');
  const ok =
    res.status === 400 &&
    (/personal mailbox|company domain|Form path/i.test(err) || /gmail\.com/i.test(err));
  if (!ok) throw new Error(`023 expected 400 personal/consumer reject, got ${res.status}: ${JSON.stringify(res.data)}`);
  results[id] = {
    status: 'Pass',
    actual:
      `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
      `domain register-employer ${email} + https://gmail.com → 400 (${err}). No Google OAuth required.`,
  };
}

let failed = false;
try {
  console.log(`Base ${BASE}`);
  await run022();
  await run023();
} catch (e) {
  failed = true;
  console.error(e);
  if (!results['TC-IS-03-022']) {
    results['TC-IS-03-022'] = { status: 'Fail', actual: `Fail: ${e.message}` };
  } else if (!results['TC-IS-03-023']) {
    results['TC-IS-03-023'] = { status: 'Fail', actual: `Fail: ${e.message}` };
  }
}

console.log('\nRESULTS', JSON.stringify(results, null, 2));

mkdirSync(resolve(appRoot, 'scripts/manual'), { recursive: true });
writeFileSync(
  resolve(appRoot, 'scripts/manual/last-tc-is-03-022-023-result.json'),
  JSON.stringify({ results, executed: new Date().toISOString(), base: BASE }, null, 2),
);

const allPass = Object.values(results).every((r) => r.status === 'Pass');
if (allPass) {
  const resultsPath = resolve(appRoot, 'test-cases/qa-results.json');
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    payload = {};
  }
  for (const [tc, entry] of Object.entries(results)) {
    for (const k of ['byTcId', 'cases', 'results']) {
      if (!payload[k]) payload[k] = {};
      payload[k][tc] = entry;
    }
  }
  payload.executedAt = new Date().toISOString();
  writeFileSync(resultsPath, JSON.stringify(payload, null, 2));
  console.log('Updated test-cases/qa-results.json');
}

if (APPLY_EXCEL && allPass) {
  execFileSync('python', [resolve(appRoot, 'scripts/apply-internsafar-qa-xlsx.py')], {
    cwd: appRoot,
    stdio: 'inherit',
  });
}

process.exit(allPass && !failed ? 0 : 1);
