#!/usr/bin/env node
/**
 * TC-IS-03-015 — self-referral does not award points.
 * Register (Google path) with the test candidate's existing email + own referral code
 * → 409 + invalid self_referral; points unchanged. Without a Google token the API answers
 * 401 first, so this needs a local server with IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1.
 *
 * Usage (from internship-portal/):
 *   node scripts/manual/run-tc-is-03-015-self-referral.mjs
 *   node scripts/manual/run-tc-is-03-015-self-referral.mjs https://internship-portal-sigma-mauve.vercel.app
 *   node scripts/manual/run-tc-is-03-015-self-referral.mjs --apply-excel
 */
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, ensureQaTestAccounts, requireQaLogin, QA_ACCOUNTS } from '../lib/ipQaAuth.mjs';
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

const TC_ID = 'TC-IS-03-015';
const CAND = { email: QA_ACCOUNTS.candidate.email, password: QA_ACCOUNTS.candidate.password };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const log = [];
function step(msg, extra) {
  const line = extra !== undefined ? `${msg} ${JSON.stringify(extra)}` : msg;
  log.push(line);
  console.log(line);
}

function isSelfInvalid(row) {
  if (!row) return false;
  const s = String(row.status || '').toLowerCase();
  const l = String(row.status_label || '').toLowerCase();
  const d = String(row.status_detail || '').toLowerCase();
  const f = String(row.filter_key || '').toLowerCase();
  return (
    s === 'invalid' ||
    f === 'invalid' ||
    l.includes('self-referral') ||
    l.includes('self referral') ||
    d.includes('own referral')
  );
}

let pass = false;
let actual = '';
let blockedReason = '';

try {
  step(`Base ${BASE}`);
  ensureQaTestAccounts(BASE);
  const login = await requireQaLogin(BASE, 'candidate');

  const before = await apiRequest(BASE, '/api/ip/referral', { cookie: login.cookie });
  if (before.status !== 200) throw new Error(`Referral GET failed: ${before.status}`);
  const code = before.data?.referral_code || before.data?.code;
  if (!code) throw new Error('No referral code on the test candidate');
  const pts0 = Number(before.data?.points ?? 0);
  const ids0 = new Set((before.data?.referrals || []).map((r) => r.id));
  step('Baseline', { code, points: pts0, refs: ids0.size });

  const reg = await apiRequest(BASE, '/api/ip/auth/register-candidate', {
    method: 'POST',
    body: { email: CAND.email, name: 'Self Referral QA', referralCode: code },
  });
  if (reg.status === 401) {
    blockedReason =
      'Duplicate + own-code check sits behind Google verification. Run against a local dev server with ' +
      'IP_ALLOW_UNVERIFIED_GOOGLE_REGISTER=1, or test manually via Sign up with Google.';
    throw new Error(blockedReason);
  }
  if (reg.status !== 409) {
    throw new Error(`Expected 409 duplicate+self, got ${reg.status}: ${JSON.stringify(reg.data)}`);
  }
  step('Register with own email+code → 409', { error: reg.data?.error });

  await sleep(1000);
  const afterLogin = await apiLogin(BASE, CAND.email, CAND.password);
  const after = await apiRequest(BASE, '/api/ip/referral', { cookie: afterLogin.cookie });
  const pts1 = Number(after.data?.points ?? 0);
  const newRows = (after.data?.referrals || []).filter((r) => r.id && !ids0.has(r.id));
  // Prefer newest self-invalid among new rows; else any recent invalid self label
  const selfRow =
    newRows.find(isSelfInvalid) ||
    (after.data?.referrals || []).find(
      (r) => isSelfInvalid(r) && String(r.display_label || '').toLowerCase().includes('self'),
    );

  step('After attempt', {
    points: pts1,
    newRefs: newRows.length,
    selfFound: Boolean(selfRow),
    status: selfRow?.status,
    status_label: selfRow?.status_label,
  });

  if (pts1 !== pts0) throw new Error(`Points changed on self-referral (${pts0} → ${pts1})`);
  if (selfRow && Number(selfRow.points_awarded || 0) > 0) {
    throw new Error('Self-referral row has points_awarded > 0');
  }
  // Must not show credited
  if (selfRow && String(selfRow.status_label || '').toLowerCase().includes('credited')) {
    throw new Error('Self-referral shows Reward Credited');
  }
  // Prefer explicit invalid self row; if API masks history, points-stable + 409 is still the contract
  if (newRows.length && !newRows.some(isSelfInvalid)) {
    throw new Error(`New referral row(s) not marked self_referral invalid: ${JSON.stringify(newRows)}`);
  }

  pass = true;
  actual =
    `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
    `register existing ${CAND.email} + own code ${code} → 409; points unchanged (${pts0}); ` +
    (selfRow
      ? `invalid self-referral recorded (${selfRow.status_label}).`
      : 'no credit (invalid attempt / points stable).');
} catch (e) {
  pass = false;
  actual = blockedReason
    ? `Blocked: ${blockedReason}`
    : `Fail: ${e.message || e}\n${log.join('\n')}`;
  if (!blockedReason) console.error(e);
}

const result = { tcId: TC_ID, status: pass ? 'Pass' : blockedReason ? 'Blocked' : 'Fail', actual };
console.log('\nRESULT', JSON.stringify(result, null, 2));

mkdirSync(resolve(appRoot, 'scripts/manual'), { recursive: true });
writeFileSync(
  resolve(appRoot, 'scripts/manual/last-tc-is-03-015-result.json'),
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

const entry = { status: result.status, actual: result.actual };
recordQaResults({ [TC_ID]: entry, 'REG-C-9': entry }, { source: 'manual/run-tc-is-03-015' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();

process.exitCode = result.status === 'Fail' ? 1 : 0;
