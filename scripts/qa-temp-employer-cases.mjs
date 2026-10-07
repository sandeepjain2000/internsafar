#!/usr/bin/env node
/**
 * SuperAdmin employer-lifecycle cases that change account state (suspend, reject, delete,
 * reset ethics, document supersede). They run on throwaway employers this script registers
 * and hard-deletes at the end — never on core accounts or the shared test employer.
 *
 *   TC-IS-14-025 New pending document after Final Approval does not block posting
 *   TC-IS-17-006 Re-upload of a document type supersedes the old file (one active per type, max four)
 *   TC-IS-14-026 Suspend blocks login; Restore waits for pending docs (rejected docs do not block);
 *                Restore Selected restores the clean one; suspend on a pending employer → 400
 *   TC-IS-14-027 Reject needs a reason; stored reason; rejected login message
 *   TC-IS-14-028 Reset Ethics → posting 403 until Accept & Save again
 *   TC-IS-14-033 Delete Selected → Rejected "Deleted By SuperAdmin", inactive, generic login error
 *
 * Requires server: IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1 (not Vercel production).
 * Usage: node scripts/qa-temp-employer-cases.mjs [baseUrl] [--apply-excel]
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { apiLogin, apiRequest, fetchLoginCaptcha, requireQaLogin } from './lib/ipQaAuth.mjs';
import { buildEmployerRegisterPersona, isCoreShowcaseEmail, runTag } from './lib/ipQaRealisticPersonas.mjs';
import { applyQaResultsToWorkbook, recordQaResults } from './lib/recordQaResults.mjs';
import { gotoReady, launchQaBrowser, newQaPage } from './lib/ipQaBrowser.mjs';

const require = createRequire(import.meta.url);
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser.js');
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: resolve(appRoot, '.env'), quiet: true });

const args = process.argv.slice(2);
const APPLY_EXCEL = args.includes('--apply-excel');
const BASE = args.find((a) => /^https?:\/\//i.test(a)) || process.env.IP_BASE || 'http://localhost:3000';
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required in .env.local.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = async (sql, params) => (await pool.query(sql, params)).rows;

const results = {};
const created = [];
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function runCase(id, fn) {
  console.log(`\n── ${id}`);
  try {
    const actual = await fn();
    results[id] = { status: 'Pass', actual: `Pass: ${actual}` };
    console.log(`PASS ${id}: ${actual}`);
  } catch (e) {
    results[id] = { status: 'Fail', actual: `Fail: ${e.message.split('\n')[0]}` };
    console.log(`FAIL ${id}: ${e.message}`);
  }
}

// ── throwaway employers ─────────────────────────────────────────────────────
let sa;
try {
  sa = await requireQaLogin(BASE, 'superadmin');
} catch (e) {
  console.error(e.message);
  await pool.end();
  process.exit(1);
}
const saApi = (path, method = 'GET', body) => apiRequest(BASE, path, { method, cookie: sa.cookie, body });

const TAG = runTag();
async function createEmployer(label, { approve }) {
  const persona = buildEmployerRegisterPersona('domain', { runTag: `${TAG}${label[0].toLowerCase()}` });
  persona.companyName = `${persona.companyName} ${label} ${TAG}`;
  check(!isCoreShowcaseEmail(persona.email), `core email ${persona.email}`);
  const cap = await fetchLoginCaptcha(BASE);
  const reg = await apiRequest(BASE, '/api/ip/auth/register-employer', {
    method: 'POST',
    body: {
      path: 'domain',
      email: persona.email,
      website: persona.website,
      companyName: persona.companyName,
      contactName: persona.contactName,
      designation: persona.designation,
      password: persona.password,
      businessEntityType: persona.businessEntityType,
      captchaToken: cap.captchaToken,
      captchaAnswer: cap.captchaAnswer,
    },
  });
  check(reg.status === 200 || reg.status === 201, `register ${label} → ${reg.status} ${JSON.stringify(reg.data)}`);
  check(reg.data?.qaVerifyUrl, 'qaVerifyUrl missing — set IP_QA_EMPLOYER_EMAIL_VERIFY_TOKEN_IN_RESPONSE=1 on the server');
  const ids = (
    await db(`SELECT u.id AS uid, e.id AS eid FROM ip_users u JOIN ip_employers e ON e.user_id = u.id WHERE lower(u.email) = lower($1)`, [persona.email])
  )[0];
  created.push(ids.uid);
  const verify = await fetch(reg.data.qaVerifyUrl);
  check(/Email verified/i.test(await verify.text()), `verify ${label} failed`);
  const emp = { label, persona, ...ids, login: () => apiLogin(BASE, persona.email, persona.password) };
  emp.session = await emp.login();
  check(emp.session.ok, `login ${label} after verify failed`);
  emp.api = (path, method = 'GET', body) => apiRequest(BASE, path, { method, cookie: emp.session.cookie, body });
  if (!approve) return emp;

  const pan = await emp.api('/api/ip/employer/documents', 'POST', {
    docType: 'Business PAN',
    fileName: 'pan.pdf',
    url: `https://files.example/${persona.runTag}/pan.pdf`,
  });
  check(pan.status === 201, `PAN upload ${label} → ${pan.status}`);
  const profile = await emp.api('/api/ip/employer/profile');
  const ethics_acks = Object.fromEntries((profile.data?.ethicsItems || []).map((i) => [i.id, true]));
  const put = await emp.api('/api/ip/employer/profile', 'PUT', {
    company_name: persona.companyName,
    website: persona.website,
    work_email: persona.email,
    industry: persona.industry || 'Technology',
    hq_city: 'Pune',
    hq_country: 'India',
    contact_name: persona.contactName,
    contact_designation: persona.designation,
    contact_phone: '9876543210',
    contact_phone_country_code: '+91',
    business_entity_type: 'Private Limited',
    ethics_acks,
  });
  check(put.status === 200 && put.data?.profileComplete, `profile ${label} not complete: ${JSON.stringify(put.data)}`);
  await reviewDoc(pan.data.id, 'approved');
  const ok = await saApi(`/api/ip/superadmin/employers/${emp.eid}`, 'PATCH', { approvalStatus: 'approved' });
  check(ok.status === 200, `final approve ${label} → ${ok.status} ${JSON.stringify(ok.data)}`);
  emp.panId = pan.data.id;
  return emp;
}
async function reviewDoc(id, reviewStatus) {
  const r = await saApi('/api/ip/superadmin/documents', 'PATCH', { id, reviewStatus });
  check(r.status === 200, `doc ${reviewStatus} → ${r.status} ${JSON.stringify(r.data)}`);
}
async function uploadDoc(emp, docType, docLabel) {
  const r = await emp.api('/api/ip/employer/documents', 'POST', {
    docType,
    docLabel,
    fileName: `${docType.replace(/\W+/g, '-')}.pdf`,
    url: `https://files.example/${emp.persona.runTag}/${Date.now()}.pdf`,
  });
  check(r.status === 201, `${emp.label} upload ${docType} → ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.id;
}
const status = async (emp) => (await db(`SELECT approval_status, rejection_reason FROM ip_employers WHERE id = $1`, [emp.eid]))[0];
const notice = async (emp, title) => (await db(`SELECT 1 FROM ip_notifications WHERE user_id = $1 AND title = $2`, [emp.uid, title])).length > 0;
const post = (emp, st = 'published') =>
  emp.api('/api/ip/employer/internships', 'POST', {
    title: `${emp.persona.internshipTitle} — ${emp.persona.runTag}`,
    description: 'QA lifecycle posting.',
    status: st,
    workMode: 'Remote',
    location: 'Pune',
  });

// SA Approvals page helpers
async function approvalsRow(page, emp, filterLabel) {
  await gotoReady(page, BASE, '/superadmin/approvals', 'input[aria-label="Search employers"]');
  await page.locator('.ip-saq-tab', { hasText: filterLabel }).first().click();
  await page.locator('input[aria-label="Search employers"]').fill(emp.persona.companyName);
  const row = page.locator('tr', { hasText: emp.persona.companyName }).first();
  await row.waitFor({ timeout: 45_000 });
  return row;
}
const toast = (page, text) => page.locator('.ip-saq-toast', { hasText: text }).waitFor({ timeout: 30_000 });

console.log(`Base ${BASE}`);
const browser = await launchQaBrowser();
try {
  const A = await createEmployer('Alpha', { approve: true });
  const B = await createEmployer('Bravo', { approve: true });
  const C = await createEmployer('Charlie', { approve: false });
  console.log('Throwaway employers ready:', [A, B, C].map((e) => e.persona.email).join(', '));

  await runCase('TC-IS-14-025', async () => {
    const docId = await uploadDoc(A, 'Other', 'Replacement registration');
    const queue = (await saApi('/api/ip/superadmin/documents?status=pending')).data?.items || [];
    check(queue.some((d) => d.id === docId), 'new document not Pending in SA Documents');
    check((await status(A)).approval_status === 'approved', 'approval_status changed after upload');
    const p = await post(A);
    check(p.status === 200 || p.status === 201, `posting after upload → ${p.status} ${JSON.stringify(p.data)}`);
    return 'Approved employer uploaded a new document → Pending in SA Documents; approval_status stayed approved; publishing still worked.';
  });

  await runCase('TC-IS-17-006', async () => {
    const newPan = await uploadDoc(A, 'Business PAN');
    const rows = await db(`SELECT id, review_status, superseded_at FROM ip_employer_documents WHERE employer_id = $1 AND doc_type = 'Business PAN'`, [A.eid]);
    const old = rows.find((r) => r.id === A.panId);
    const fresh = rows.find((r) => r.id === newPan);
    check(old?.superseded_at && old.review_status === 'approved', 'old approved PAN not kept as superseded history');
    check(fresh && !fresh.superseded_at && fresh.review_status === 'pending', 'new PAN not active + pending');
    check(rows.filter((r) => !r.superseded_at).length === 1, 'more than one active Business PAN');
    const profileDocs = (await A.api('/api/ip/employer/profile')).data?.documents || [];
    check(profileDocs.filter((d) => d.doc_type === 'Business PAN').map((d) => d.id).join() === newPan, 'Profile & docs does not show only the new PAN');
    const saDocs = (await saApi('/api/ip/superadmin/documents?status=all')).data?.items || [];
    check(!saDocs.some((d) => d.id === A.panId) && saDocs.some((d) => d.id === newPan), 'superseded PAN still in SA Documents');
    await uploadDoc(A, 'Shop Act');
    await uploadDoc(A, 'LLP registration');
    await uploadDoc(A, 'Shop Act');
    const active = await db(`SELECT doc_type FROM ip_employer_documents WHERE employer_id = $1 AND superseded_at IS NULL`, [A.eid]);
    check(active.length === 4 && new Set(active.map((d) => d.doc_type)).size === 4, `active docs ${JSON.stringify(active)}`);
    return 'Re-uploaded Business PAN: old approved file kept as superseded history and hidden from Profile & docs and SA Documents; new file Pending; after all four types (+ a second Shop Act) exactly 4 active docs, one per type.';
  });

  await runCase('TC-IS-14-026', async () => {
    for (const d of await db(`SELECT id FROM ip_employer_documents WHERE employer_id = $1 AND superseded_at IS NULL AND review_status = 'pending'`, [A.eid])) {
      await reviewDoc(d.id, 'approved');
    }
    const pendingDoc = await uploadDoc(A, 'Other', 'Updated trade licence');
    const page = await newQaPage(browser, sa);
    try {
      let row = await approvalsRow(page, A, 'Approved');
      await row.getByRole('button', { name: 'Suspend' }).click();
      await toast(page, 'Suspended 1 employer');
      check((await status(A)).approval_status === 'suspended', 'not suspended');
      check(await notice(A, 'Employer Account Suspended'), 'no "Employer Account Suspended" notice');
      const blocked = await A.login();
      check(!blocked.ok && /suspended/i.test(blocked.loginError || ''), `suspended login → ${blocked.loginError}`);

      row = await approvalsRow(page, A, 'Suspended');
      await row.getByRole('button', { name: 'Restore' }).click();
      const alert = page.locator('[role="alert"]', { hasText: 'Review pending documents before Restore' }).first();
      await alert.waitFor({ timeout: 30_000 });
      const alertText = await alert.innerText();
      check(
        alertText.includes(`Cannot restore ${A.persona.companyName}: 1 document still waiting for review.`) &&
          (await page.getByTestId('approvals-open-documents').isVisible()),
        `restore alert: ${alertText}`,
      );
      check((await status(A)).approval_status === 'suspended', 'restore went through despite a pending document');
      row = await approvalsRow(page, A, 'Suspended');
      await row.getByRole('button', { name: /Audit/ }).click();
      await page.getByRole('button', { name: 'Restore employer' }).click();
      const auditAlert = page.getByTestId('approvals-audit-error');
      await auditAlert.waitFor({ timeout: 30_000 });
      check(/Cannot restore/.test(await auditAlert.innerText()) && /Open Documents/.test(await auditAlert.innerText()), 'Audit & Docs alert missing');
      await page.locator('[aria-labelledby="ip-saq-audit-title"] [aria-label="Close"]').click();

      await reviewDoc(pendingDoc, 'rejected');
      row = await approvalsRow(page, A, 'Suspended');
      await row.getByRole('button', { name: 'Restore' }).click();
      await toast(page, 'Approved 1 employer');
      check((await status(A)).approval_status === 'approved', 'restore after rejecting the doc failed');
      check(await notice(A, 'Employer Account Restored'), 'no "Employer Account Restored" notice');
      A.session = await A.login();
      check(A.session.ok, 'restored employer cannot sign in');
      const p = await post(A, 'draft');
      check(p.status === 200 || p.status === 201, `draft after restore → ${p.status} ${JSON.stringify(p.data)}`);

      await uploadDoc(A, 'Other', 'Second licence copy');
      for (const e of [A, B]) {
        const s = await saApi(`/api/ip/superadmin/employers/${e.eid}`, 'PATCH', { approvalStatus: 'suspended' });
        check(s.status === 200, `suspend ${e.label} → ${s.status}`);
      }
      await gotoReady(page, BASE, '/superadmin/approvals', 'input[aria-label="Search employers"]');
      await page.locator('.ip-saq-tab', { hasText: 'Suspended' }).first().click();
      await page.locator('input[aria-label="Search employers"]').fill(TAG);
      for (const e of [A, B]) await page.locator(`input[aria-label="Select ${e.persona.companyName}"]`).check({ timeout: 45_000 });
      await page.getByRole('button', { name: 'Restore Selected (2)' }).click();
      const bulkAlert = page.locator('[role="alert"]', { hasText: '1 employer not updated' }).first();
      await bulkAlert.waitFor({ timeout: 30_000 });
      check((await bulkAlert.innerText()).includes(A.persona.companyName), 'bulk alert does not name the blocked employer');
      check((await status(B)).approval_status === 'approved' && (await status(A)).approval_status === 'suspended', 'Restore Selected outcome wrong');

      const bad = await saApi(`/api/ip/superadmin/employers/${C.eid}`, 'PATCH', { approvalStatus: 'suspended' });
      check(bad.status === 400 && bad.data?.error === 'Only approved employers can be suspended.', `suspend pending → ${bad.status} ${JSON.stringify(bad.data)}`);
    } finally {
      await page.context().close();
    }
    return 'Suspend (row) → notice + suspended login message; Restore refused with "Review pending documents before Restore — Cannot restore <Company>: 1 document still waiting…" + Open Documents (row and Audit & Docs), stays Suspended; rejected doc does not block → Restore works, Restored notice, login + posting gate open (draft saved); Restore Selected restored the clean employer and named the blocked one; suspend on pending → 400 "Only approved employers can be suspended."';
  });

  await runCase('TC-IS-14-027', async () => {
    const page = await newQaPage(browser, sa);
    try {
      const row = await approvalsRow(page, B, 'Approved');
      await row.getByRole('button', { name: 'Reject' }).click();
      const dlg = page.locator('[aria-labelledby="ip-saq-reject-title"]');
      await dlg.getByRole('button', { name: 'Other', exact: true }).click();
      await dlg.getByRole('button', { name: /Reject & notify/ }).click();
      await page.getByText('Rejection reason is required').first().waitFor({ timeout: 15_000 });
      check((await status(B)).approval_status === 'approved', 'rejected without a reason');
      await dlg.getByRole('button', { name: 'Incorrect Company Details', exact: true }).click();
      await dlg.getByRole('button', { name: /Reject & notify/ }).click();
      await toast(page, 'Rejected 1 employer');
    } finally {
      await page.context().close();
    }
    const s = await status(B);
    check(s.approval_status === 'rejected' && s.rejection_reason === 'Incorrect Company Details', `stored ${JSON.stringify(s)}`);
    check(await notice(B, 'Employer Account Rejected'), 'no "Employer Account Rejected" notice');
    const login = await B.login();
    check(!login.ok && /registration was rejected/i.test(login.loginError || ''), `rejected login → ${login.loginError}`);
    return 'Reject with preset Other + empty note → "Rejection reason is required" (no change); preset "Incorrect Company Details" → Rejected, reason stored, notice sent (mail send not checked here); login shows the rejected message.';
  });

  await runCase('TC-IS-14-028', async () => {
    for (const d of await db(`SELECT id FROM ip_employer_documents WHERE employer_id = $1 AND superseded_at IS NULL AND review_status = 'pending'`, [A.eid])) {
      await reviewDoc(d.id, 'approved');
    }
    const restore = await saApi(`/api/ip/superadmin/employers/${A.eid}`, 'PATCH', { approvalStatus: 'approved' });
    check(restore.status === 200, `restore Alpha → ${restore.status} ${JSON.stringify(restore.data)}`);
    A.session = await A.login();
    const page = await newQaPage(browser, sa);
    try {
      await approvalsRow(page, A, 'Approved');
      await page.locator(`input[aria-label="Select ${A.persona.companyName}"]`).check();
      await page.getByRole('button', { name: 'Reset Ethics (1)' }).click();
      await toast(page, 'Reset ethics for 1 employer');
    } finally {
      await page.context().close();
    }
    const row = (
      await db(
        `SELECT e.ethics_acks, e.ethics_accepted_at, u.profile_complete FROM ip_employers e JOIN ip_users u ON u.id = e.user_id WHERE e.id = $1`,
        [A.eid],
      )
    )[0];
    check(Object.keys(row.ethics_acks || {}).length === 0 && !row.ethics_accepted_at && row.profile_complete === false, `after reset ${JSON.stringify(row)}`);
    const blocked = await post(A, 'draft');
    check(blocked.status === 403 && /Accept all Guidelines & Ethics acknowledgements and save them before posting\./.test(blocked.data?.error || ''), `draft after reset → ${blocked.status} ${JSON.stringify(blocked.data)}`);
    const items = (await A.api('/api/ip/employer/profile')).data?.ethicsItems || [];
    const save = await A.api('/api/ip/employer/profile', 'PUT', { ethics_acks: Object.fromEntries(items.map((i) => [i.id, true])) });
    check(save.status === 200 && save.data?.ethicsComplete, `Accept & Save → ${save.status}`);
    const ok = await post(A, 'draft');
    check(ok.status === 200 || ok.status === 201, `draft after re-save → ${ok.status} ${JSON.stringify(ok.data)}`);
    return 'Reset Ethics (Approvals) cleared ethics_acks / ethics_accepted_at and set profile_complete false; draft → 403 "Accept all Guidelines & Ethics…"; after Accept & Save the draft saved.';
  });

  await runCase('TC-IS-14-033', async () => {
    const page = await newQaPage(browser, sa);
    try {
      await approvalsRow(page, C, 'Pending');
      await page.locator(`input[aria-label="Select ${C.persona.companyName}"]`).check();
      await page.getByRole('button', { name: 'Delete Selected (1)' }).click();
      await toast(page, 'Deleted 1 employer');
    } finally {
      await page.context().close();
    }
    const s = await status(C);
    const active = (await db(`SELECT active FROM ip_users WHERE id = $1`, [C.uid]))[0]?.active;
    check(s.approval_status === 'rejected' && s.rejection_reason === 'Deleted By SuperAdmin' && active === false, `after delete ${JSON.stringify({ ...s, active })}`);
    const login = await C.login();
    check(!login.ok && /Invalid email or password/.test(login.loginError || ''), `deleted login → ${login.loginError}`);
    return 'Delete Selected → Rejected with reason "Deleted By SuperAdmin", user inactive; sign-in shows the generic "Invalid email or password".';
  });
} catch (e) {
  console.error(`Setup failed: ${e.message}`);
  for (const id of ['TC-IS-14-025', 'TC-IS-17-006', 'TC-IS-14-026', 'TC-IS-14-027', 'TC-IS-14-028', 'TC-IS-14-033']) {
    results[id] ||= { status: 'Blocked', actual: `Blocked: throwaway employer setup failed — ${e.message}` };
  }
} finally {
  await browser.close().catch(() => {});
  const client = await pool.connect();
  try {
    for (const userId of created) await hardDeleteIpUser(client, { userId, allowSuperadmin: false });
    console.log(`Hard-deleted ${created.length} throwaway employer(s).`);
  } finally {
    client.release();
  }
  await pool.end();
}

recordQaResults(results, { source: 'qa-temp-employer-cases' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();
const counts = Object.values(results).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
console.log(`\nDone: ${JSON.stringify(counts)}`);
process.exit(counts.Fail || counts.Blocked ? 1 : 0);
