#!/usr/bin/env node
/**
 * TC-IS-03-007 — form-path referral: +25 only after SuperAdmin approve; reject → no credit.
 * Fully API-automated (no Google OAuth).
 *
 * Usage (from internship-portal/):
 *   node scripts/manual/run-tc-is-03-007-form-referral.mjs
 *   node scripts/manual/run-tc-is-03-007-form-referral.mjs https://internship-portal-sigma-mauve.vercel.app
 *   node scripts/manual/run-tc-is-03-007-form-referral.mjs --apply-excel
 */
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, fetchLoginCaptcha, QA_ACCOUNTS } from '../lib/ipQaAuth.mjs';

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

const TC_ID = 'TC-IS-03-007';
const REFERRER = { email: QA_ACCOUNTS.candidate.email, password: QA_ACCOUNTS.candidate.password };
const SA = { email: QA_ACCOUNTS.superadmin.email, password: QA_ACCOUNTS.superadmin.password };
const stamp = Date.now().toString(36);
const EMAIL_APPROVE = `lawsonlclintern+form03007a-${stamp}@gmail.com`;
const EMAIL_REJECT = `lawsonlclintern+form03007b-${stamp}@gmail.com`;
const REG_PW = 'Admin@1234';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function registerForm(email, name, referralCode) {
  const cap = await fetchLoginCaptcha(BASE);
  const res = await apiRequest(BASE, '/api/ip/auth/register-candidate', {
    method: 'POST',
    body: {
      path: 'form',
      email,
      name,
      password: REG_PW,
      university: 'QA University',
      graduationYear: 2027,
      referralCode,
      captchaToken: cap.captchaToken,
      captchaAnswer: cap.captchaAnswer,
    },
  });
  return res;
}

/** Candidate referral GET masks emails — match by new id / filter_key / label. */
function refIds(data) {
  return new Set((data?.referrals || []).map((r) => r.id));
}

function findNewRef(data, beforeIds) {
  return (data?.referrals || []).find((r) => r.id && !beforeIds.has(r.id));
}

function isAwaiting(row) {
  if (!row) return false;
  const s = String(row.status || '').toLowerCase();
  const f = String(row.filter_key || '').toLowerCase();
  const l = String(row.status_label || '').toLowerCase();
  return s === 'pending' || f === 'awaiting' || l.includes('awaiting');
}

function isCredited(row) {
  if (!row) return false;
  const s = String(row.status || '').toLowerCase();
  const f = String(row.filter_key || '').toLowerCase();
  const l = String(row.status_label || '').toLowerCase();
  return s === 'completed' || f === 'credited' || l.includes('credited');
}

function isInvalidRejected(row) {
  if (!row) return false;
  const s = String(row.status || '').toLowerCase();
  const d = String(row.status_detail || '').toLowerCase();
  const l = String(row.status_label || '').toLowerCase();
  return s === 'invalid' || d.includes('rejected') || l.includes('invalid');
}

function pointsOf(data) {
  return Number(data?.points ?? 0);
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

  const refLogin = await apiLogin(BASE, REFERRER.email, REFERRER.password);
  if (!refLogin.ok) throw new Error(`Referrer login failed: ${REFERRER.email}`);
  const before = await apiRequest(BASE, '/api/ip/referral', { cookie: refLogin.cookie });
  if (before.status !== 200) throw new Error(`Referral GET failed: ${before.status}`);
  const code = before.data?.referral_code || before.data?.code;
  if (!code) throw new Error('No referral code on +1');
  const pts0 = pointsOf(before.data);
  const ids0 = refIds(before.data);
  step('Referrer baseline', { code, points: pts0, refs: ids0.size });

  // ── Part A: approve → +25 ──────────────────────────────────────────────
  const regA = await registerForm(EMAIL_APPROVE, 'Form QA Approve', code);
  if (regA.status !== 200 && regA.status !== 201) {
    throw new Error(`Register A failed ${regA.status}: ${JSON.stringify(regA.data)}`);
  }
  step('Registered approve-path candidate', { email: EMAIL_APPROVE, status: regA.status });

  await sleep(800);
  const midA = await apiRequest(BASE, '/api/ip/referral', { cookie: refLogin.cookie });
  const rowA = findNewRef(midA.data, ids0);
  const ptsMidA = pointsOf(midA.data);
  const pendingOk = isAwaiting(rowA);
  const noCreditYet = ptsMidA === pts0;
  step('After register (before SA)', {
    found: Boolean(rowA),
    id: rowA?.id,
    status: rowA?.status,
    status_label: rowA?.status_label,
    points: ptsMidA,
    pendingOk,
    noCreditYet,
  });
  if (!pendingOk) throw new Error('Approve-path referral not pending/Awaiting after form register');
  if (!noCreditYet) throw new Error(`Points credited before approval (${pts0} → ${ptsMidA})`);
  const idA = rowA.id;

  const saLogin = await apiLogin(BASE, SA.email, SA.password);
  if (!saLogin.ok) throw new Error('SuperAdmin login failed');
  const listPending = await apiRequest(BASE, '/api/ip/superadmin/form-registrations?status=pending', {
    cookie: saLogin.cookie,
  });
  const formUserA = (listPending.data?.items || []).find(
    (u) => String(u.email || '').toLowerCase() === EMAIL_APPROVE.toLowerCase(),
  );
  if (!formUserA?.id) throw new Error(`Pending form user not found for ${EMAIL_APPROVE}`);
  const approve = await apiRequest(BASE, '/api/ip/superadmin/form-registrations', {
    method: 'PATCH',
    cookie: saLogin.cookie,
    body: { status: 'approved', id: formUserA.id },
  });
  if (approve.status !== 200) {
    throw new Error(`Approve failed ${approve.status}: ${JSON.stringify(approve.data)}`);
  }
  step('SuperAdmin approved', { id: formUserA.id });

  await sleep(1200);
  const afterALogin = await apiLogin(BASE, REFERRER.email, REFERRER.password);
  const afterA = await apiRequest(BASE, '/api/ip/referral', { cookie: afterALogin.cookie });
  const rowA2 = (afterA.data?.referrals || []).find((r) => r.id === idA);
  const ptsA = pointsOf(afterA.data);
  const credited = ptsA === pts0 + 25 && isCredited(rowA2);
  step('After approve', {
    points: ptsA,
    expect: pts0 + 25,
    status: rowA2?.status,
    status_label: rowA2?.status_label,
    credited,
  });
  if (!credited) {
    throw new Error(`Approve path failed: points ${ptsA} (want ${pts0 + 25}), row=${JSON.stringify(rowA2)}`);
  }

  // ── Part B: reject → no extra +25 ──────────────────────────────────────
  const ptsAfterApprove = ptsA;
  const idsAfterA = refIds(afterA.data);
  const regB = await registerForm(EMAIL_REJECT, 'Form QA Reject', code);
  if (regB.status !== 200 && regB.status !== 201) {
    throw new Error(`Register B failed ${regB.status}: ${JSON.stringify(regB.data)}`);
  }
  step('Registered reject-path candidate', { email: EMAIL_REJECT });

  await sleep(800);
  const midBLogin = await apiLogin(BASE, REFERRER.email, REFERRER.password);
  const midB = await apiRequest(BASE, '/api/ip/referral', { cookie: midBLogin.cookie });
  const rowBpending = findNewRef(midB.data, idsAfterA);
  if (!isAwaiting(rowBpending)) {
    throw new Error(`Reject-path referral not awaiting: ${JSON.stringify(rowBpending)}`);
  }
  if (pointsOf(midB.data) !== ptsAfterApprove) {
    throw new Error('Points changed before reject approval decision');
  }
  const idB = rowBpending.id;

  let saCookie = saLogin.cookie;
  let listPending2 = await apiRequest(BASE, '/api/ip/superadmin/form-registrations?status=pending', {
    cookie: saCookie,
  });
  let pendingItems = listPending2.data?.items || [];
  if (listPending2.status !== 200) {
    const sa2 = await apiLogin(BASE, SA.email, SA.password);
    saCookie = sa2.cookie;
    listPending2 = await apiRequest(BASE, '/api/ip/superadmin/form-registrations?status=pending', {
      cookie: saCookie,
    });
    pendingItems = listPending2.data?.items || [];
  }
  const formUserB = pendingItems.find(
    (u) => String(u.email || '').toLowerCase() === EMAIL_REJECT.toLowerCase(),
  );
  if (!formUserB?.id) throw new Error(`Pending form user not found for ${EMAIL_REJECT}`);
  const reject = await apiRequest(BASE, '/api/ip/superadmin/form-registrations', {
    method: 'PATCH',
    cookie: saCookie,
    body: { status: 'rejected', id: formUserB.id },
  });
  if (reject.status !== 200) {
    throw new Error(`Reject failed ${reject.status}: ${JSON.stringify(reject.data)}`);
  }
  step('SuperAdmin rejected', { id: formUserB.id });

  await sleep(1200);
  const afterBLogin = await apiLogin(BASE, REFERRER.email, REFERRER.password);
  const afterB = await apiRequest(BASE, '/api/ip/referral', { cookie: afterBLogin.cookie });
  const rowB = (afterB.data?.referrals || []).find((r) => r.id === idB);
  const ptsB = pointsOf(afterB.data);
  const noExtra = ptsB === ptsAfterApprove;
  step('After reject', {
    points: ptsB,
    expectSame: ptsAfterApprove,
    status: rowB?.status,
    status_label: rowB?.status_label,
    noExtra,
    invalid: isInvalidRejected(rowB),
  });
  if (!noExtra) throw new Error(`Reject still credited points (${ptsAfterApprove} → ${ptsB})`);
  if (isCredited(rowB)) throw new Error('Reject row shows Reward Credited');
  if (rowB && !isInvalidRejected(rowB) && isAwaiting(rowB)) {
    throw new Error('Reject row still Awaiting — expected invalid/rejected');
  }

  pass = true;
  actual =
    `API Pass ${new Date().toISOString().slice(0, 10)} (${BASE.includes('vercel') ? 'Vercel' : 'local'}): ` +
    `form register ${EMAIL_APPROVE} with +1 code → Awaiting/no +25 → SA approve → +25 Reward Credited; ` +
    `form register ${EMAIL_REJECT} → SA reject → points unchanged (no credit).`;
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
  resolve(outDir, 'last-tc-is-03-007-result.json'),
  JSON.stringify(
    {
      sheet: '03 Candidate Registration',
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
  if (!payload.byTcId) payload.byTcId = {};
  if (!payload.cases) payload.cases = {};
  const entry = { status: 'Pass', actual: result.actual };
  payload.byTcId[TC_ID] = entry;
  payload.cases[TC_ID] = entry;
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
