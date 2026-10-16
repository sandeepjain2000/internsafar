#!/usr/bin/env node
/**
 * Only the alias-snapshot cases inside the checklist fixtures.
 * Does not run the rest of the checklist. Merges these ids into qa-results.json
 * and does not apply the workbook.
 *
 *   node scripts/qa-alias-scoped-cases.mjs [baseUrl]
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, requireQaLogin } from './lib/ipQaAuth.mjs';
import { runCaptchaAndRegistrationGapCases, runFixtureCases } from './lib/ipQaFixtureCases.mjs';
import { assertQaHost } from './lib/ipQaAliasSnapshot.mjs';
import { recordQaResults } from './lib/recordQaResults.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: resolve(appRoot, '.env'), quiet: true });

const BASE = process.argv.find((a) => /^https?:\/\//i.test(a)) || process.env.IP_BASE || 'http://localhost:3000';
assertQaHost(BASE);

const KEEP = new Set([
  'REG-E-2', 'REG-E-3', 'REG-E-4', 'REG-E-5',
  'TC-IS-03-009', 'TC-IS-03-010', 'TC-IS-03-012', 'TC-IS-03-018',
  'EMP-I-3', 'EMP-I-9', 'SA-A-2',
]);
const results = {};
function assess(id, ok, actual) {
  const status = ok ? 'Pass' : 'Fail';
  console.log(`${status.toUpperCase()} ${id}`);
  if (KEEP.has(id)) results[id] = { status, actual };
}
function blocked(id, actual) {
  console.log(`BLOCKED ${id}: ${typeof actual === 'string' ? actual : JSON.stringify(actual)}`);
  if (KEEP.has(id)) results[id] = { status: 'Blocked', actual };
}

const api = (path, opts = {}) => apiRequest(BASE, path, opts);
if (!process.argv.includes('--mutations-only')) {
  await runCaptchaAndRegistrationGapCases({ BASE, assess, blocked, apiLogin });
}

const emp = await requireQaLogin(BASE, 'employer');
const sa = await requireQaLogin(BASE, 'superadmin');
const cand = await requireQaLogin(BASE, 'candidate');
await runFixtureCases({
  api, apiLogin, BASE, assess, blocked, cand, emp, sa,
  onlyIds: new Set(['EMP-I-3', 'EMP-I-9', 'SA-A-2']),
});

if (Object.keys(results).length) recordQaResults(results, { source: 'qa-alias-scoped-cases' });
const counts = Object.values(results).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
console.log(JSON.stringify({ base: BASE, counts, ids: Object.keys(results) }));
process.exit(Object.values(results).some((r) => r.status === 'Fail') ? 1 : 0);
