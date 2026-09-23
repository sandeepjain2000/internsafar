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
 * Usage (from internship-portal/):
 *   node scripts/qa-employer-reg-verify-approve-login.mjs
 *   node scripts/qa-employer-reg-verify-approve-login.mjs --path=free_email
 *   node scripts/qa-employer-reg-verify-approve-login.mjs http://localhost:3000
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiLogin, apiRequest, fetchLoginCaptcha, QA_ACCOUNTS } from './lib/ipQaAuth.mjs';
import { buildEmployerRegisterPersona, isCoreShowcaseEmail } from './lib/ipQaRealisticPersonas.mjs';

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

const persona = buildEmployerRegisterPersona(registrationPath);
const REG_PW = persona.password;
const SA = { email: QA_ACCOUNTS.superadmin.email, password: QA_ACCOUNTS.superadmin.password };

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

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

// 4) SuperAdmin session + find employer
const sa = await apiLogin(BASE, SA.email, SA.password);
if (!sa.ok) fail(`SuperAdmin login failed for ${SA.email}`);
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

async function tryFinalApprove(label) {
  return apiRequest(BASE, `/api/ip/superadmin/employers/${employer.id}`, {
    method: 'PATCH',
    cookie: sa.cookie,
    body: { approvalStatus: 'approved' },
  });
}

function assertBlocked(res, label) {
  if (res.status === 200 && res.data?.ok) {
    fail(`${label}: Final Approval succeeded but should be BLOCKED`);
  }
  const err = String(res.data?.error || '');
  if (!/document/i.test(err)) {
    fail(`${label}: expected documents-gate error, got ${res.status} ${JSON.stringify(res.data)}`);
  }
  ok(`${label}: blocked`, { status: res.status, error: err.slice(0, 160) });
}

// Step 1: Final Approve with zero documents -> BLOCK
assertBlocked(await tryFinalApprove('step1-no-docs'), 'step1-no-docs');

// Step 2: insert pending document (employer uploaded)
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
let docId;
try {
  docId = newId('ip_edoc');
  await pool.query(
    `INSERT INTO ip_employer_documents (id, employer_id, doc_type, file_name, url, review_status)
     VALUES ($1,$2,'Business PAN',$3,$4,'pending')`,
    [
      docId,
      employer.id,
      `${persona.companySlug}-pan.pdf`,
      `https://files.example/${persona.companySlug}/pan.pdf`,
    ],
  );
  ok('step2-upload: pending document inserted', { docId });
} finally {
  await pool.end();
}

// Step 3: Final Approve while pending -> BLOCK
assertBlocked(await tryFinalApprove('step3-pending-doc'), 'step3-pending-doc');

// Step 4: SuperAdmin approves the document
const docApprove = await apiRequest(BASE, '/api/ip/superadmin/documents', {
  method: 'PATCH',
  cookie: sa.cookie,
  body: { id: docId, reviewStatus: 'approved' },
});
if (docApprove.status !== 200 || !docApprove.data?.ok) {
  fail(`step4-approve-doc failed ${docApprove.status}: ${JSON.stringify(docApprove.data)}`);
}
ok('step4-approve-doc: document approved', { docId });

// Step 5: Final Approve employer -> OK
const approve = await tryFinalApprove('step5-final-approve');
if (approve.status !== 200 || !approve.data?.ok) {
  fail(`step5-final-approve failed ${approve.status}: ${JSON.stringify(approve.data)}`);
}
ok('step5-final-approve: Final Employer Approval granted');

// 6) Fresh login AFTER approval
const empLogin = await apiLogin(BASE, persona.email, REG_PW);
if (!empLogin.ok) fail(`Employer login failed after approval: ${JSON.stringify(empLogin)}`);
if (empLogin.role !== 'employer') fail(`Expected role=employer, got ${empLogin.role}`);
const approvedDash = await apiRequest(BASE, '/api/ip/employer/dashboard', { cookie: empLogin.cookie });
if (String(approvedDash.data?.employer?.approvalStatus).toLowerCase() !== 'approved') {
  fail(`Expected approved on dashboard: ${JSON.stringify(approvedDash.data?.employer)}`);
}
ok('Employer login + dashboard after Final Approval', { email: empLogin.email });

console.log(
  '\nPASS employer reg → verify → pending login → docs-gate (block/block/ok) → approved login',
);
console.log(
  JSON.stringify(
    {
      path: registrationPath,
      email: persona.email,
      company: persona.companyName,
      employerId: employer.id,
      docId,
      passwordSource: 'form_submitted_at_register',
      tempPasswordEmail: false,
      assertedPendingLoginAfterVerify: true,
      assertedDocsGate: ['block_no_docs', 'block_pending_doc', 'ok_after_doc_approved'],
      assertedApprovedLoginAfterFinalApproval: true,
      puml: 'docs/employer-final-approval-documents-first.puml',
    },
    null,
    2,
  ),
);
