#!/usr/bin/env node
/**
 * Employer register E2E (docs/employer-registration-flow.puml +
 * docs/employer-final-approval-documents-first.puml):
 *   Register → email verify → pending login →
 *   Final Approve blocked (0 docs) → upload pending doc →
 *   Final Approve blocked (pending) → approve doc →
 *   Final Employer Approval → login.
 *
 * Live product note: employers do NOT receive a temporary password email.
 * They set the password on the form. This script asserts verify + ack mail
 * *attempts* via qaOutboundMails (when QA exposure is on).
 *
 * Requires on the *server* under test:
 *   IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1
 *   (blocked automatically when VERCEL_ENV=production)
 *
 * Requires locally for the docs seed step:
 *   DATABASE_URL in .env.local (same Neon as local/Vercel)
 *
 * Uses a throwaway employer it registers itself (never a core or shared test account)
 * and the SuperAdmin login. Workbook cases recorded per step into qa-results.json:
 *   TC-IS-03-030 password chosen at register, no temp-password mail
 *   TC-IS-03-026 verify link: first open verifies; reused + tampered links fail cleanly
 *   TC-IS-14-024 Final Approval docs gate: none / pending / only rejected / approved+rejected
 *   TC-IS-18-051 posting gate order: approval → email verified → ethics → profile (drafts too)
 *
 * Usage (from internship-portal/):
 *   node scripts/qa-employer-reg-verify-approve-login.mjs
 *   node scripts/qa-employer-reg-verify-approve-login.mjs --path=free_email
 *   node scripts/qa-employer-reg-verify-approve-login.mjs http://localhost:3000 --apply-excel
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, fetchLoginCaptcha, requireQaLogin } from './lib/ipQaAuth.mjs';
import { buildEmployerRegisterPersona, isCoreShowcaseEmail } from './lib/ipQaRealisticPersonas.mjs';
import { applyQaResultsToWorkbook, createCaseRecorder } from './lib/recordQaResults.mjs';

const require = createRequire(import.meta.url);

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const args = process.argv.slice(2);
const pathArg = args.find((a) => a.startsWith('--path='));
const registrationPath = (pathArg ? pathArg.split('=')[1] : 'domain').replace('-', '_');
const BASE =
  args.find((a) => !a.startsWith('-')) ||
  process.env.IP_BASE ||
  'http://localhost:3000';

const APPLY_EXCEL = args.includes('--apply-excel');
const persona = buildEmployerRegisterPersona(registrationPath);
const REG_PW = persona.password;
const cases = createCaseRecorder({ source: 'qa-employer-reg-verify-approve-login' });

function finish(code) {
  cases.flush();
  if (APPLY_EXCEL) applyQaResultsToWorkbook();
  process.exit(code);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  cases.failOpen(msg);
  finish(1);
}
process.on('uncaughtException', (e) => fail(e?.message || String(e)));

function ok(msg, extra) {
  console.log(`OK  ${msg}${extra !== undefined ? ` ${JSON.stringify(extra)}` : ''}`);
}

if (isCoreShowcaseEmail(persona.email)) {
  fail(`Refusing to use a core showcase email: ${persona.email}`);
}

ok(`Base ${BASE} path=${registrationPath}`);
ok('Persona', {
  email: persona.email,
  company: persona.companyName,
  contact: persona.contactName,
});

// 1) Register
cases.begin('TC-IS-03-030', 'TC-IS-03-026');
const cap = await fetchLoginCaptcha(BASE);
const body = {
  path: registrationPath,
  email: persona.email,
  companyName: persona.companyName,
  contactName: persona.contactName,
  designation: persona.designation,
  password: REG_PW,
  businessEntityType: persona.businessEntityType,
  captchaToken: cap.captchaToken,
  captchaAnswer: cap.captchaAnswer,
};
if (registrationPath === 'domain') body.website = persona.website;

const reg = await apiRequest(BASE, '/api/ip/auth/register-employer', { method: 'POST', body });
if (reg.status !== 200 && reg.status !== 201) {
  fail(`Register ${reg.status}: ${JSON.stringify(reg.data)}`);
}
if (reg.data?.mode !== registrationPath) {
  fail(`Expected mode=${registrationPath}, got ${reg.data?.mode}`);
}
ok('Registered', { userId: reg.data.userId, mode: reg.data.mode, warning: reg.data.warning || null });

if (!reg.data?.qaVerifyUrl) {
  fail(
    'qaVerifyUrl missing. Set IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1 on the server (not Vercel production) and restart.',
  );
}

const mails = Array.isArray(reg.data.qaOutboundMails) ? reg.data.qaOutboundMails : [];
const verifyMail = mails.find((m) => m.purpose === 'employer_email_verify');
const ackMail = mails.find((m) => m.purpose === 'employer_register_ack');
if (!verifyMail || !ackMail) {
  fail(`Expected qaOutboundMails for verify + ack, got ${JSON.stringify(mails)}`);
}
const extraMails = mails.filter((m) => m !== verifyMail && m !== ackMail);
if (extraMails.length || mails.some((m) => /temp|password/i.test(`${m.purpose} ${m.subject}`))) {
  fail(`Only the verify + ack mails may be sent at register (no temp password): ${JSON.stringify(mails)}`);
}
ok('Outbound mail attempts recorded', {
  verify: verifyMail.subject,
  verifyMailOk: verifyMail.mailOk,
  ack: ackMail.subject,
  ackMailOk: ackMail.mailOk,
  note: reg.data.qaNote,
});

// 2) Login must fail BEFORE email verify
const earlyLogin = await apiLogin(BASE, persona.email, REG_PW);
if (earlyLogin.ok) fail('Login succeeded before email verification');
ok('Login blocked before email verify (expected)');

// 3) Consume verify link (real page / consume path)
const verifyRes = await fetch(reg.data.qaVerifyUrl, { redirect: 'manual' });
const verifyHtml = await verifyRes.text();
if (verifyRes.status >= 400 || /Could not verify/i.test(verifyHtml)) {
  fail(`Email verify failed status=${verifyRes.status}`);
}
if (!/Email verified/i.test(verifyHtml)) {
  fail('Verify page did not show Email verified');
}
ok('Email verified via qaVerifyUrl');

async function expectVerifyRefused(url, label, errorRe) {
  const res = await fetch(url, { redirect: 'manual' });
  const html = await res.text();
  if (res.status >= 500 || !/Could not verify/i.test(html) || !errorRe.test(html)) {
    fail(`${label}: expected the friendly "Could not verify" state, got status=${res.status}`);
  }
  ok(`${label}: refused cleanly`, { status: res.status });
}
await expectVerifyRefused(reg.data.qaVerifyUrl, 'Reused verify link', /already used/i);
const tampered = new URL(reg.data.qaVerifyUrl);
tampered.searchParams.set('token', `${tampered.searchParams.get('token').slice(0, -4)}0000`);
await expectVerifyRefused(tampered.toString(), 'Tampered verify link', /invalid|expired|not found|could not/i);

// 3b) After verify, still pending: LOGIN MUST SUCCEED (docs path)
const pendingLogin = await apiLogin(BASE, persona.email, REG_PW);
if (!pendingLogin.ok) {
  fail(`Login must succeed after email verify while pending: ${JSON.stringify(pendingLogin)}`);
}
if (pendingLogin.role !== 'employer') fail(`Expected role=employer, got ${pendingLogin.role}`);
const pendingDash = await apiRequest(BASE, '/api/ip/employer/dashboard', { cookie: pendingLogin.cookie });
if (pendingDash.status !== 200 || String(pendingDash.data?.employer?.approvalStatus).toLowerCase() !== 'pending') {
  fail(`Pending dashboard failed: ${JSON.stringify(pendingDash.data?.employer)}`);
}
ok('Pending employer login + dashboard after email verify', {
  email: pendingLogin.email,
  approvalStatus: pendingDash.data.employer.approvalStatus,
  emailVerified: pendingDash.data.employer.emailVerified,
});
if (pendingDash.data.employer.emailVerified !== true) fail('Dashboard does not show emailVerified after verify');
cases.pass(
  'TC-IS-03-030',
  `Pass: ${persona.email} signed in with the password chosen at register after verify; register sent only verify + ack mails (${mails.length}), no temp password.`,
);
cases.pass(
  'TC-IS-03-026',
  'Pass: first open → "Email verified", emailVerified true, login allowed; reused link → "already used"; tampered token → friendly "Could not verify" (no 5xx).',
);

// 3c) Posting gate 1 (approval) while pending — published and draft
cases.begin('TC-IS-18-051');
async function tryPost(cookie, status) {
  return apiRequest(BASE, '/api/ip/employer/internships', {
    method: 'POST',
    cookie,
    body: {
      title: `${persona.internshipTitle} — gate check`,
      description: 'Gate check — must not be created.',
      status,
      workMode: 'Remote',
      location: 'Pune',
    },
  });
}
async function expectPostBlocked(cookie, label, errorRe, statuses = ['published']) {
  for (const status of statuses) {
    const res = await tryPost(cookie, status);
    if (res.status !== 403 || !errorRe.test(String(res.data?.error || ''))) {
      fail(`${label} (${status}): expected 403 ${errorRe}, got ${res.status} ${JSON.stringify(res.data)}`);
    }
  }
  ok(`${label}: posting blocked`, { statuses });
}
const gateLog = [];
await expectPostBlocked(pendingLogin.cookie, 'Gate 1 approval', /must be approved by SuperAdmin before posting/i, [
  'published',
  'draft',
]);
gateLog.push('approval');

// 4) SuperAdmin session + find employer
const sa = await requireQaLogin(BASE, 'superadmin');
const list = await apiRequest(BASE, '/api/ip/superadmin/employers?status=pending', {
  cookie: sa.cookie,
});
if (list.status !== 200) fail(`Pending list ${list.status}`);
const employer = (list.data?.items || []).find(
  (e) => String(e.account_email || e.work_email || '').toLowerCase() === persona.email.toLowerCase(),
);
if (!employer?.id) fail(`Pending employer not found for ${persona.email}`);
ok('Found on Approvals queue', { employerId: employer.id, source: employer.registration_source });

// 5) Docs-first gate — exact QA sequence from
//    docs/employer-final-approval-documents-first.puml
const { Pool } = require('pg');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL required in .env.local to seed documents for Final Approval');

async function tryFinalApprove() {
  return apiRequest(BASE, `/api/ip/superadmin/employers/${employer.id}`, {
    method: 'PATCH',
    cookie: sa.cookie,
    body: { approvalStatus: 'approved' },
  });
}

function assertBlocked(res, label, errorRe) {
  if (res.status === 200 && res.data?.ok) {
    fail(`${label}: Final Approval succeeded but should be BLOCKED`);
  }
  const err = String(res.data?.error || '');
  if (!errorRe.test(err)) {
    fail(`${label}: expected ${errorRe}, got ${res.status} ${JSON.stringify(res.data)}`);
  }
  ok(`${label}: blocked`, { status: res.status, error: err.slice(0, 160) });
}

const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
async function insertPendingDoc(docType, slug) {
  const id = newId('ip_edoc');
  await pool.query(
    `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status)
     VALUES ($1,$2,$3,$4,$5,'pending')`,
    [id, employer.id, docType, `${persona.companySlug}-${slug}.pdf`, `https://files.example/${persona.companySlug}/${slug}.pdf`],
  );
  return id;
}
async function reviewDoc(id, reviewStatus, label) {
  const res = await apiRequest(BASE, '/api/ip/superadmin/documents', {
    method: 'PATCH',
    cookie: sa.cookie,
    body: { id, reviewStatus, ...(reviewStatus === 'rejected' ? { notes: 'QA: unreadable scan' } : {}) },
  });
  if (res.status !== 200 || !res.data?.ok) fail(`${label} failed ${res.status}: ${JSON.stringify(res.data)}`);
  ok(`${label}: document ${reviewStatus}`, { id });
}

cases.begin('TC-IS-14-024');
// Step 1: zero documents -> BLOCK
assertBlocked(await tryFinalApprove(), 'step1-no-docs', /has not uploaded any verification documents/i);

// Step 2: one pending document -> BLOCK
const rejectedDocId = await insertPendingDoc('Business PAN', 'pan');
ok('step2-upload: pending document inserted', { docId: rejectedDocId });
assertBlocked(await tryFinalApprove(), 'step2-pending-doc', /approve this employer's pending document/i);

// Step 3: only rejected documents -> BLOCK
await reviewDoc(rejectedDocId, 'rejected', 'step3-reject-doc');
assertBlocked(await tryFinalApprove(), 'step3-only-rejected', /approve at least one verification document/i);

// Step 4: 1 approved + 1 rejected + 0 pending -> OK
const docId = await insertPendingDoc('Shop Act', 'shop-act');
await reviewDoc(docId, 'approved', 'step4-approve-doc');
const approve = await tryFinalApprove();
if (approve.status !== 200 || !approve.data?.ok) {
  fail(`step4-final-approve failed ${approve.status}: ${JSON.stringify(approve.data)}`);
}
ok('step4-final-approve: Final Employer Approval granted');
cases.pass(
  'TC-IS-14-024',
  'Pass: Final Approval blocked with no docs ("has not uploaded…"), with one pending doc ("approve this employer\'s pending document…"), with only rejected docs ("approve at least one…"); succeeded with 1 approved + 1 rejected + 0 pending.',
);

// 6) Fresh login AFTER approval
const empLogin = await apiLogin(BASE, persona.email, REG_PW);
if (!empLogin.ok) fail(`Employer login failed after approval: ${JSON.stringify(empLogin)}`);
if (empLogin.role !== 'employer') fail(`Expected role=employer, got ${empLogin.role}`);
const approvedDash = await apiRequest(BASE, '/api/ip/employer/dashboard', { cookie: empLogin.cookie });
if (String(approvedDash.data?.employer?.approvalStatus).toLowerCase() !== 'approved') {
  fail(`Expected approved on dashboard: ${JSON.stringify(approvedDash.data?.employer)}`);
}
ok('Employer login + dashboard after Final Approval', { email: empLogin.email });

// 7) Posting gates 2–4 on the approved throwaway employer (gate 1 checked while pending)
const empUserId = (await pool.query(`SELECT user_id FROM ip_employers WHERE id = $1`, [employer.id])).rows[0]?.user_id;
if (!empUserId) fail('Could not resolve the throwaway employer user id');
await pool.query(`UPDATE ip_users SET email_verified_at = NULL WHERE id = $1`, [empUserId]);
try {
  await expectPostBlocked(empLogin.cookie, 'Gate 2 email verified', /Verify your email before posting/i);
} finally {
  await pool.query(`UPDATE ip_users SET email_verified_at = now() WHERE id = $1`, [empUserId]);
}
gateLog.push('email');

await expectPostBlocked(empLogin.cookie, 'Gate 3 ethics', /Guidelines & Ethics acknowledgements and save them/i, [
  'published',
  'draft',
]);
gateLog.push('ethics');

const profileGet = await apiRequest(BASE, '/api/ip/employer/profile', { cookie: empLogin.cookie });
const ethicsIds = (profileGet.data?.ethicsItems || []).map((i) => i.id);
if (!ethicsIds.length) fail(`Employer profile GET returned no ethicsItems: ${JSON.stringify(profileGet.data)}`);
const ethicsSave = await apiRequest(BASE, '/api/ip/employer/profile', {
  method: 'PUT',
  cookie: empLogin.cookie,
  body: { ethics_acks: Object.fromEntries(ethicsIds.map((id) => [id, true])) },
});
if (ethicsSave.status !== 200 || !ethicsSave.data?.ethicsComplete) {
  fail(`Saving ethics failed ${ethicsSave.status}: ${JSON.stringify(ethicsSave.data)}`);
}
if (ethicsSave.data.profileComplete) fail('Profile already complete after ethics-only save; cannot check gate 4');
await expectPostBlocked(empLogin.cookie, 'Gate 4 profile complete', /Complete your employer profile before posting/i, [
  'published',
  'draft',
]);
gateLog.push('profile');
cases.pass(
  'TC-IS-18-051',
  `Pass: POST /api/ip/employer/internships gates fired in order ${gateLog.join(' → ')} with the expected 403 messages; drafts blocked at approval, ethics and profile gates.`,
);
await pool.end();

console.log(
  '\nPASS employer reg → verify (reuse/tamper) → pending login → docs-gate (none/pending/rejected/ok) → approved login → posting gates',
);
console.log(
  JSON.stringify(
    {
      path: registrationPath,
      email: persona.email,
      company: persona.companyName,
      employerId: employer.id,
      docId,
      rejectedDocId,
      passwordSource: 'form_submitted_at_register',
      tempPasswordEmail: false,
      assertedPendingLoginAfterVerify: true,
      assertedDocsGate: ['block_no_docs', 'block_pending_doc', 'block_only_rejected', 'ok_approved_plus_rejected'],
      assertedApprovedLoginAfterFinalApproval: true,
      assertedPostingGates: gateLog,
      puml: 'docs/employer-final-approval-documents-first.puml',
    },
    null,
    2,
  ),
);
finish(0);
