#!/usr/bin/env node
/**
 * MANUAL ONLY — TC-IS-06-007 (candidate login email change + Zoho OTP).
 *
 * Not invoked by run-internsafar-qa.mjs. Full automated QA skips this case on purpose.
 *
 * Usage (from internship-portal/):
 *   npm run dev
 *   node scripts/manual/run-tc-is-06-007-email-change.mjs              # step 1 — request OTP
 *   # paste code into .env.local → IP_QA_EMAIL_CHANGE_CODE=######
 *   node scripts/manual/run-tc-is-06-007-email-change.mjs              # step 2 — verify (within 10 min)
 *   node scripts/manual/run-tc-is-06-007-email-change.mjs --apply-excel
 *
 * Procedure doc: test-cases/manual/TC-IS-06-007-EMAIL-CHANGE.md
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { runTcIs06007 } from '../lib/ipQaRemainingExtras.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..', '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const args = process.argv.slice(2);
const APPLY_EXCEL = args.includes('--apply-excel');
const BASE = args.find((a) => !a.startsWith('-')) || process.env.IP_BASE || 'http://localhost:3000';

const TC_ID = 'TC-IS-06-007';
const SHEET = '06 Candidate Profile';

let result = { tcId: TC_ID, status: 'Not Run', actual: '' };

function assess(_id, ok, actual) {
  result = {
    tcId: TC_ID,
    status: ok ? 'Pass' : 'Fail',
    actual: typeof actual === 'string' ? actual : JSON.stringify(actual),
  };
}

function blocked(_id, actual) {
  result = {
    tcId: TC_ID,
    status: 'Blocked',
    actual: typeof actual === 'string' ? actual : String(actual),
  };
}

const hasCode = Boolean(process.env.IP_QA_EMAIL_CHANGE_CODE?.trim());
console.log(`
TC-IS-06-007 — manual email-change OTP test
Base: ${BASE}
Step: ${hasCode ? '2 (verify with env code)' : '1 (request OTP — env code must be unset)'}
`);

await runTcIs06007({ BASE, assess, blocked });

console.log(JSON.stringify(result, null, 2));

if (result.status === 'Blocked' && !hasCode) {
  console.log(`
NEXT: Check Zoho/Gmail for OTP to lawsonlclintern+qa-email-change-to@gmail.com
      (copy also at support.placementhub@placementhub.online when ISM_TEST_ENVIRONMENT=true)

Add to internship-portal/.env.local (never commit):
  IP_QA_EMAIL_CHANGE_CODE=######

Re-run this same command within 10 minutes. Then remove IP_QA_EMAIL_CHANGE_CODE when done.
`);
}

if (result.status === 'Pass') {
  console.log(`
PASS — remove IP_QA_EMAIL_CHANGE_CODE from .env.local so the next run does not use a stale code.
`);
}

const outDir = resolve(appRoot, 'scripts/manual');
mkdirSync(outDir, { recursive: true });
const payloadPath = resolve(outDir, 'last-tc-is-06-007-result.json');
writeFileSync(
  payloadPath,
  JSON.stringify(
    {
      sheet: SHEET,
      tc_id: TC_ID,
      automation: 'Manual',
      status: result.status,
      actual: result.actual,
      executed: new Date().toISOString(),
    },
    null,
    2,
  ),
);

if (APPLY_EXCEL) {
  const updater = resolve(
    appRoot,
    '..',
    '_archive-root-clutter',
    'testcase-picker',
    'update_case_result.py',
  );
  execFileSync('python', [updater, payloadPath], { stdio: 'inherit' });
  console.log(`Excel updated (${SHEET} / ${TC_ID})`);
}

if (result.status === 'Fail') process.exitCode = 1;
