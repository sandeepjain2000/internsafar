#!/usr/bin/env node
/**
 * TC-IS-03-022 — candidate register rejects a non-Gmail email before Google verification.
 * The Gmail-only rule runs before the Google token check, so no OAuth is needed.
 *
 * Usage:
 *   node scripts/manual/run-tc-is-03-022-register-reject.mjs
 *   node scripts/manual/run-tc-is-03-022-register-reject.mjs https://internship-portal-sigma-mauve.vercel.app --apply-excel
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRequest } from '../lib/ipQaAuth.mjs';
import { applyQaResultsToWorkbook, recordQaResults } from '../lib/recordQaResults.mjs';

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
  const res = await apiRequest(BASE, '/api/ip/auth/register-candidate', {
    method: 'POST',
    body: { email, name: 'Non Gmail QA' },
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

let failed = false;
try {
  console.log(`Base ${BASE}`);
  await run022();
} catch (e) {
  failed = true;
  console.error(e);
  results['TC-IS-03-022'] = { status: 'Fail', actual: `Fail: ${e.message}` };
}

console.log('\nRESULTS', JSON.stringify(results, null, 2));

mkdirSync(resolve(appRoot, 'scripts/manual'), { recursive: true });
writeFileSync(
  resolve(appRoot, 'scripts/manual/last-tc-is-03-022-result.json'),
  JSON.stringify({ results, executed: new Date().toISOString(), base: BASE }, null, 2),
);

recordQaResults(results, { source: 'manual/run-tc-is-03-022' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();

process.exitCode = failed ? 1 : 0;
