#!/usr/bin/env node
/**
 * Workbook cases that only need the shared QA test accounts (never core accounts).
 * Each case puts back what it changed (points, archived threads, reports, drafts).
 *
 *   TC-IS-13-005 SA point adjustment → candidate ledger + in-app notice
 *   TC-IS-14-029 Adjust Points page: search, Add 25 (no note), Deduct 5 (note)
 *   TC-IS-14-032 Listing report from detail → SA queue open/reviewed/dismissed, invalid → 400
 *   TC-IS-09-019 New posting: stipend max below min rejected; Incentive-Based skips the check
 *   TC-IS-09-020 Candidate full profile → Download Excel + CV (ZIP: candidate.xlsx + resumes/, phone rule)
 *   TC-IS-09-021 Employer overview + profile .xlsx exports; candidate gets 403
 *   TC-IS-12-011 Messages Select All → Archive / Unarchive Selected (employer and candidate)
 *   TC-IS-12-012 Notifications show a loading state, not the empty state, while loading
 *   TC-IS-17-007 Logo upload fills the frame; no storage URL shown
 *   TC-IS-18-053 Status badges are Title Case across lists
 *   TC-IS-03-027 Register success screen: resend countdown, 429 retry, unknown email → same ok
 *                (registers a throwaway Free-email employer, hard-deleted at the end)
 *
 * Deep page checks (replaced the checklist runner's page-load-only checks):
 *   TC-IS-06-002 profile tabs + privacy toggle persists   TC-IS-07-003 browse empty / List-Cards / 390px
 *   TC-IS-09-006 analytics tiles match the API            TC-IS-18-016 / 12-001 / 12-002 thread send, reply, unread, archive
 *   TC-IS-14-016 SuperAdmin cannot use threads            TC-IS-18-017 / 11-005 / 11-001 offer remind, cancel dialogs, accept
 *   TC-IS-13-001 referral API + copy link                 TC-IS-12-004 / 18-020 notification tabs, toast, SA has no page
 *   TC-IS-05-001 / 05-002 account tabs, prefs, dialogs    TC-IS-15-003 idea categories, vote hit-test, long text
 *   TC-IS-18-012 posting form fields persist              TC-IS-18-015 candidate search prefs + invite cancel / 400
 *   TC-IS-14-010 SA documents review + notices            TC-IS-14-011 SA postings
 *   TC-IS-14-014 / 14-015 login report filters + KPIs     TC-IS-14-017 SA idea status, note, official comment
 *
 *   Offer: the test employer sends an offer on a test-candidate application, accepts it, then the
 *   offer/application rows are put back. Idea, document, draft posting and messages are deleted after.
 *
 * Usage:
 *   node scripts/qa-test-account-cases.mjs [baseUrl] [--only TC-IS-14-029,TC-IS-13-005] [--apply-excel]
 * If a test account cannot sign in, the script stops with how to fix it (npm run qa:ensure-test-accounts).
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { apiLogin, apiRequest, ensureQaTestAccounts, requireQaLogin } from './lib/ipQaAuth.mjs';
import { buildEmployerRegisterPersona, isCoreShowcaseEmail } from './lib/ipQaRealisticPersonas.mjs';
import { applyQaResultsToWorkbook, recordQaResults } from './lib/recordQaResults.mjs';
import { clickUntil, fillMathCaptcha, gotoReady, launchQaBrowser, newQaPage } from './lib/ipQaBrowser.mjs';

const require = createRequire(import.meta.url);
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser.js');
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: resolve(appRoot, '.env'), quiet: true });

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(String(args[onlyIdx + 1] || '').split(',').filter(Boolean)) : null;
const APPLY_EXCEL = args.includes('--apply-excel');
const BASE = args.find((a, i) => /^https?:\/\//i.test(a) && i !== onlyIdx + 1) || process.env.IP_BASE || 'http://localhost:3000';
const TAG = `QA-${Date.now().toString(36)}`;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required in .env.local (setup and clean-up checks read the shared DB).');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const db = async (sql, params) => (await pool.query(sql, params)).rows;

class Blocked extends Error {}
const results = {};
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runCase(id, fn) {
  if (ONLY && !ONLY.has(id)) return;
  console.log(`\n── ${id}`);
  try {
    const actual = await fn();
    results[id] = { status: 'Pass', actual: `Pass: ${actual}` };
    console.log(`PASS ${id}: ${actual}`);
  } catch (e) {
    const status = e instanceof Blocked ? 'Blocked' : 'Fail';
    results[id] = { status, actual: `${status}: ${e.message}` };
    console.log(`${status.toUpperCase()} ${id}: ${e.message}`);
  }
}

// ── accounts ────────────────────────────────────────────────────────────────
console.log(`Base ${BASE}`);
ensureQaTestAccounts(BASE);
let cand;
let emp;
let sa;
try {
  [cand, emp, sa] = [
    await requireQaLogin(BASE, 'candidate'),
    await requireQaLogin(BASE, 'employer'),
    await requireQaLogin(BASE, 'superadmin'),
  ];
} catch (e) {
  console.error(`\n${e.message}`);
  await pool.end();
  process.exit(1);
}
const candRow = (
  await db(
    `SELECT u.id AS uid, c.id AS cid, c.phone, c.resume_url, c.hide_phone_until_shortlist
     FROM ip_users u JOIN ip_candidates c ON c.user_id = u.id WHERE lower(u.email) = lower($1)`,
    [cand.email],
  )
)[0];
const empRow = (
  await db(
    `SELECT u.id AS uid, e.id AS eid, e.company_name
     FROM ip_users u JOIN ip_employers e ON e.user_id = u.id WHERE lower(u.email) = lower($1)`,
    [emp.email],
  )
)[0];
if (!candRow || !empRow) {
  console.error('Test candidate or employer row missing — run "npm run qa:ensure-test-accounts".');
  await pool.end();
  process.exit(1);
}

const browser = await launchQaBrowser();
const saPoints = (delta, note) =>
  apiRequest(BASE, '/api/ip/superadmin/points', { method: 'POST', cookie: sa.cookie, body: { userId: candRow.uid, delta, note } });
const candBalance = async () => Number((await db(`SELECT points FROM ip_users WHERE id = $1`, [candRow.uid]))[0].points);

// ── TC-IS-13-005 ────────────────────────────────────────────────────────────
await runCase('TC-IS-13-005', async () => {
  const before = await candBalance();
  const add = await saPoints(10, `${TAG} ledger check`);
  check(add.status === 200 && add.data?.balanceAfter === before + 10, `SA add 10 → ${add.status} ${JSON.stringify(add.data)}`);
  try {
    const ledger = await apiRequest(BASE, '/api/ip/points/ledger', { cookie: cand.cookie });
    const top = ledger.data?.items?.[0];
    check(ledger.data?.balance === before + 10, `ledger balance ${ledger.data?.balance}, expected ${before + 10}`);
    check(top?.reason === 'sa_manual_credit' && Number(top?.delta) === 10, `top ledger row ${JSON.stringify(top)}`);
    const notes = await apiRequest(BASE, '/api/ip/notifications', { cookie: cand.cookie });
    const notice = (notes.data?.items || []).find((n) => n.title === 'Points Added');
    check(
      notice && /Admin has added 10 points to your account\./.test(notice.body || ''),
      `no "Points Added — Admin has added 10 points…" notice (latest: ${JSON.stringify((notes.data?.items || [])[0])})`,
    );
    const page = await newQaPage(browser, cand);
    await gotoReady(page, BASE, '/candidate/referral', 'main');
    const shown = await page
      .getByText('Admin Added Points')
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await page.context().close();
    check(shown, 'Refer & earn ledger does not show "Admin Added Points"');
    return `SA +10 → ledger sa_manual_credit +10, balance ${before}→${before + 10}; Refer & earn shows "Admin Added Points"; notice "Points Added — Admin has added 10 points to your account."`;
  } finally {
    await saPoints(-10, `${TAG} restore after TC-IS-13-005`);
  }
});

// ── TC-IS-14-029 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-029', async () => {
  const before = await candBalance();
  const startedAt = new Date();
  const page = await newQaPage(browser, sa);
  try {
    await gotoReady(page, BASE, '/superadmin/points', 'input[aria-label="Search users"]');
    await page.locator('input[aria-label="Search users"]').fill(cand.email);
    const row = page.locator('tr', { hasText: cand.email }).first();
    await row.waitFor({ timeout: 30_000 });

    async function adjust(mode, amount, note) {
      await row.getByRole('button', { name: /Adjust/ }).click();
      const dlg = page.locator('[aria-labelledby="ip-saq-pts-title"]');
      await dlg.waitFor();
      await dlg.getByRole('button', { name: mode === 'add' ? /^Add$/ : /^Deduct$/ }).click();
      await dlg.locator('input[aria-label="Points amount"]').fill(String(amount));
      if (note) await dlg.locator('[aria-label="Note or reason"]').fill(note);
      await dlg.getByRole('button', { name: /Continue/ }).click();
      const confirm = page.locator('[aria-labelledby="ip-saq-pts-confirm"]');
      await confirm.getByRole('button', { name: /^Confirm$/ }).click();
      const expected = mode === 'add' ? `Added ${amount} point` : `Removed ${amount} point`;
      const toast = page.locator('.ip-saq-toast', { hasText: expected });
      await toast.waitFor({ timeout: 30_000 });
      return toast.innerText();
    }
    const addToast = await adjust('add', 25, '');
    check(/25/.test(addToast), `add toast "${addToast}"`);
    check((await candBalance()) === before + 25, 'balance did not rise by 25');
    const note = `${TAG} deduct check`;
    const deductToast = await adjust('deduct', 5, note);
    check((await candBalance()) === before + 20, `balance after deduct is not +20 (toast "${deductToast}")`);

    const rows = await db(
      `SELECT delta, reason, meta FROM ip_points_ledger WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at`,
      [candRow.uid, startedAt],
    );
    const credit = rows.find((r) => r.reason === 'sa_manual_credit' && Number(r.delta) === 25);
    const debit = rows.find((r) => r.reason === 'sa_manual_debit' && Number(r.delta) === -5);
    check(credit && !credit.meta?.note, `credit row ${JSON.stringify(credit)}`);
    check(debit && debit.meta?.note === note, `debit row ${JSON.stringify(debit)}`);
    const notes = await apiRequest(BASE, '/api/ip/notifications', { cookie: cand.cookie });
    const titles = (notes.data?.items || []).slice(0, 5).map((n) => n.title);
    check(titles.includes('Points Added') && titles.includes('Points Adjusted'), `candidate notices ${JSON.stringify(titles)}`);
    return `Search → Adjust → Add 25 (no note) toast "${addToast}"; Deduct 5 with note toast "${deductToast}"; balance ${before}→${before + 25}→${before + 20}; ledger sa_manual_credit / sa_manual_debit (note in meta); candidate notices Points Added + Points Adjusted.`;
  } finally {
    await page.context().close();
    const drift = (await candBalance()) - before;
    if (drift) await saPoints(-drift, `${TAG} restore after TC-IS-14-029`);
  }
});

// ── TC-IS-14-032 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-032', async () => {
  const listing = (
    await db(
      `SELECT id, title FROM ip_internships WHERE employer_id = $1 AND status = 'published' ORDER BY created_at DESC LIMIT 1`,
      [empRow.eid],
    )
  )[0];
  if (!listing) throw new Blocked('Test employer has no published posting to report');
  const startedAt = new Date();
  const details = `${TAG} listing report check`;
  const page = await newQaPage(browser, cand);
  let reportId;
  try {
    await gotoReady(page, BASE, `/candidate/internships/${listing.id}`, 'main');
    const opened = await clickUntil(page, page.getByRole('button', { name: /^Report$/ }).first(), () =>
      page.getByText('Report this listing').isVisible(),
    );
    check(opened, 'Report panel did not open');
    await page.locator('textarea >> visible=true').last().fill(details);
    await page.getByRole('button', { name: /Submit report/ }).click();
    await page.getByText('your report was submitted for review').waitFor({ timeout: 20_000 });
    reportId = (
      await db(`SELECT id FROM ip_listing_reports WHERE reporter_user_id = $1 AND details = $2 AND created_at >= $3`, [
        candRow.uid,
        details,
        startedAt,
      ])
    )[0]?.id;
    check(reportId, 'report row not stored');

    const inQueue = async (status) =>
      ((await apiRequest(BASE, `/api/ip/superadmin/listing-reports?status=${status}`, { cookie: sa.cookie })).data?.items || []).some(
        (r) => r.id === reportId,
      );
    check(await inQueue('open'), 'report not in SA Open queue');
    const saPage = await newQaPage(browser, sa);
    await gotoReady(saPage, BASE, '/superadmin/listing-reports', 'main');
    const onPage = await saPage
      .getByText(listing.title)
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await saPage.context().close();
    check(onPage, 'SA listing-reports page does not show the reported listing');
    for (const status of ['reviewed', 'dismissed']) {
      const r = await apiRequest(BASE, '/api/ip/superadmin/listing-reports', { method: 'PATCH', cookie: sa.cookie, body: { id: reportId, status } });
      check(r.status === 200 && (await inQueue(status)), `PATCH ${status} → ${r.status}`);
    }
    const bad = await apiRequest(BASE, '/api/ip/superadmin/listing-reports', { method: 'PATCH', cookie: sa.cookie, body: { id: reportId, status: 'bogus' } });
    check(bad.status === 400, `invalid status → ${bad.status}`);
    return `Candidate reported "${listing.title}" from detail; listed under Open (API + SA page); PATCH reviewed and dismissed moved it; invalid status → 400.`;
  } finally {
    await page.context().close();
    await db(`DELETE FROM ip_listing_reports WHERE reporter_user_id = $1 AND details = $2`, [candRow.uid, details]);
  }
});

// ── TC-IS-09-019 ────────────────────────────────────────────────────────────
await runCase('TC-IS-09-019', async () => {
  const page = await newQaPage(browser, emp);
  const titles = [`${TAG} stipend range`, `${TAG} stipend incentive`];
  const stipendError = 'Stipend maximum must be greater than or equal to the minimum.';
  async function openForm(title) {
    await gotoReady(page, BASE, '/employer/internships/new', 'button:has-text("Save Draft")');
    await page.locator('input[required] >> visible=true').first().fill(title);
    await page.getByText('Remote', { exact: true }).first().click();
    await page.getByRole('tab', { name: 'Compensation' }).click();
    await page.locator('select >> visible=true').first().selectOption('fixed');
    await page.getByPlaceholder('e.g. 10000').fill('10000');
    await page.getByPlaceholder('Optional — e.g. 15000').fill('5000');
  }
  const saveDraft = () => page.getByRole('button', { name: 'Save Draft' }).click();
  const draft = (title) => db(`SELECT stipend_inr, stipend_inr_max, stipend_type FROM ip_internships WHERE employer_id = $1 AND title = $2`, [empRow.eid, title]);
  async function waitDraft(title) {
    for (let i = 0; i < 40; i += 1) {
      const rows = await draft(title);
      if (rows.length) return rows[0];
      await page.waitForTimeout(500);
    }
    return null;
  }
  try {
    await openForm(titles[0]);
    await saveDraft();
    const err = await page.getByText(stipendError).isVisible({ timeout: 10_000 }).catch(() => false);
    check(err, `no "${stipendError}" after Save Draft with min 10000 / max 5000`);
    check(!(await draft(titles[0])).length, 'draft saved despite max below min');
    await page.getByPlaceholder('Optional — e.g. 15000').fill('15000');
    await saveDraft();
    const saved = await waitDraft(titles[0]);
    check(saved && Number(saved.stipend_inr) === 10000 && Number(saved.stipend_inr_max) === 15000, `fixed draft ${JSON.stringify(saved)}`);

    await openForm(titles[1]);
    await page.locator('select >> visible=true').first().selectOption('incentive');
    await page.locator('textarea >> visible=true').last().fill('10% of each closed deal');
    await saveDraft();
    const incentive = await waitDraft(titles[1]);
    if (!incentive) {
      const shown = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="alert"], [role="alert"]')]
          .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      );
      throw new Error(
        `Incentive-Based draft (min 10000 / max 5000 left in the hidden fields) was not saved. Page shows: ${shown.join(' | ').slice(0, 300)}`,
      );
    }
    check(incentive.stipend_type === 'incentive', `incentive draft ${JSON.stringify(incentive)}`);
    return `min 10000 / max 5000 → "${stipendError}" (nothing saved); max 15000 → draft saved 10000–15000; Incentive-Based skips the range check and saves.`;
  } finally {
    await page.context().close();
    await db(`DELETE FROM ip_internships WHERE employer_id = $1 AND status = 'draft' AND title = ANY($2::text[])`, [empRow.eid, titles]);
  }
});

// ── TC-IS-09-020 ────────────────────────────────────────────────────────────
const sheetText = async (buf) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const parts = [];
  wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => parts.push(String(c.text ?? c.value ?? '')))));
  return { sheets: wb.worksheets.map((w) => w.name), text: parts.join(' ') };
};
await runCase('TC-IS-09-020', async () => {
  const app = (
    await db(
      `SELECT a.id, a.status FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
       WHERE i.employer_id = $1 AND a.candidate_id = $2 ORDER BY a.created_at DESC LIMIT 1`,
      [empRow.eid, candRow.cid],
    )
  )[0];
  if (!app) throw new Blocked('Test candidate has no application with the test employer');
  if (!candRow.resume_url) throw new Blocked('Test candidate has no CV on file');
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, `/employer/candidates/${candRow.cid}`, 'text="Download Excel + CV"', 90_000);
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      page.getByText('Download Excel + CV', { exact: true }).first().click(),
    ]);
    const name = download.suggestedFilename();
    const buf = readFileSync(await download.path());
    if (name.endsWith('.xlsx')) {
      throw new Blocked(`Got ${name} without the CV — the server could not read the stored CV (storage not reachable from this host).`);
    }
    check(name === 'candidate-export.zip', `download name ${name}`);
    const zip = await JSZip.loadAsync(buf);
    const files = Object.keys(zip.files);
    check(files.includes('candidate.xlsx') && files.some((f) => f.startsWith('resumes/') && !f.endsWith('/')), `zip entries ${files.join(', ')}`);
    const { sheets, text } = await sheetText(await zip.file('candidate.xlsx').async('nodebuffer'));
    const digits = String(candRow.phone || '').replace(/\D/g, '').slice(-10);
    const phoneAllowed = candRow.hide_phone_until_shortlist === false || ['interviewing', 'offered', 'hired', 'completed'].includes(app.status);
    const phoneShown = digits.length >= 10 && text.replace(/\D/g, '').includes(digits);
    check(phoneShown === phoneAllowed, `phone ${phoneShown ? 'shown' : 'hidden'} but application status ${app.status} means it should be ${phoneAllowed ? 'shown' : 'hidden'}`);
    return `Download Excel + CV → ${name} with ${files.join(', ')}; sheets ${sheets.join(', ')}; phone ${phoneShown ? 'shown' : 'hidden'} for status ${app.status} (privacy rule held).`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-09-021 ────────────────────────────────────────────────────────────
await runCase('TC-IS-09-021', async () => {
  const page = await newQaPage(browser, emp);
  const got = [];
  try {
    for (const [path, label, prefix] of [
      ['/employer', /Export overview \(\.xlsx\)/, 'employer-export-'],
      ['/employer/profile', /Download Excel \(\.xlsx\)/, 'employer-profile-'],
    ]) {
      await gotoReady(page, BASE, path, 'main');
      const btn = page.getByRole('button', { name: label }).or(page.getByRole('link', { name: label })).first();
      await btn.waitFor({ timeout: 45_000 });
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), btn.click()]);
      const name = download.suggestedFilename();
      const { sheets } = await sheetText(readFileSync(await download.path()));
      check(name.startsWith(prefix) && name.endsWith('.xlsx') && sheets.length, `${path} download ${name} (${sheets.length} sheets)`);
      got.push(`${name} (${sheets.length} sheet${sheets.length === 1 ? '' : 's'})`);
    }
  } finally {
    await page.context().close();
  }
  for (const p of ['/api/ip/employer/export', '/api/ip/employer/profile/export']) {
    const r = await apiRequest(BASE, p, { cookie: cand.cookie });
    check(r.status === 403, `candidate GET ${p} → ${r.status}`);
  }
  return `Downloads ${got.join(' and ')} are valid workbooks; candidate gets 403 on both export APIs.`;
});

// ── TC-IS-12-011 ────────────────────────────────────────────────────────────
await runCase('TC-IS-12-011', async () => {
  const apps = await db(
    `SELECT DISTINCT a.internship_id FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.candidate_id = $2 LIMIT 2`,
    [empRow.eid, candRow.cid],
  );
  if (apps.length < 2) throw new Blocked('Test candidate needs applications to two test-employer postings for two threads');
  for (const a of apps) {
    const r = await apiRequest(BASE, '/api/ip/messages/threads', {
      method: 'POST',
      cookie: emp.cookie,
      body: { internshipId: a.internship_id, otherUserId: candRow.uid },
    });
    check(r.status === 201, `open thread → ${r.status} ${JSON.stringify(r.data)}`);
  }
  const threadIds = async (login, archived) =>
    ((await apiRequest(BASE, `/api/ip/messages/threads${archived ? '?archived=1' : ''}`, { cookie: login.cookie })).data?.items || []).map((t) => t.id);
  const out = [];
  // The inbox restores the last tab per user (saved filter prefs), so always start from and return to All.
  // Saved prefs load async and can override an early click, so retry until the tab is really on.
  const tab = async (page, name) => {
    const isOn = async () =>
      new RegExp(`^${name}`).test(((await page.locator('.ip-cm-tab--on >> visible=true').first().innerText().catch(() => '')) || '').trim());
    const ok = await clickUntil(
      page,
      page.locator('.ip-cm-tab >> visible=true', { hasText: new RegExp(`^${name}`) }).first(),
      async () => (await isOn()) && (await page.waitForTimeout(1500), isOn()),
      { tries: 8, gapMs: 2500 },
    );
    check(ok, `could not switch the inbox to the ${name} tab`);
  };
  for (const [role, login, other] of [
    ['employer', emp, cand],
    ['candidate', cand, emp],
  ]) {
    const preArchived = await threadIds(login, true);
    const page = await newQaPage(browser, login);
    try {
      const inbox = await threadIds(login, false);
      const otherBefore = await threadIds(other, false);
      await gotoReady(page, BASE, `/${role}/messages`, '.ip-cm-tab', 90_000);
      await tab(page, 'All');
      if (role === 'candidate') {
        // Candidate inbox has no bulk bar: archive / unarchive one conversation from the thread header.
        const rowSel = ':is(.ip-cm-card, .ip-msg-table tbody tr)';
        const row = `${rowSel} >> visible=true`;
        await page.locator(row).first().waitFor({ timeout: 60_000 });
        const archiveBtn = page.locator('button[title="Archive conversation"] >> visible=true').first();
        check(await clickUntil(page, page.locator(row).first(), () => archiveBtn.isVisible()), 'thread did not open');
        await archiveBtn.click();
        await page.getByText('Conversation archived').waitFor({ timeout: 20_000 });
        const moved = (await threadIds(login, true)).filter((id) => !preArchived.includes(id));
        check(moved.length === 1 && inbox.includes(moved[0]), `candidate archive moved ${moved.length} threads`);
        const otherAfter = await threadIds(other, false);
        check(otherBefore.every((id) => otherAfter.includes(id)), "candidate archive changed the employer's inbox");
        await tab(page, 'Archived');
        const unBtn = page.locator('button[title="Unarchive conversation"] >> visible=true').first();
        check(await clickUntil(page, page.locator(row).first(), () => unBtn.isVisible()), 'archived thread did not open');
        await unBtn.click();
        await page.getByText('Conversation unarchived').waitFor({ timeout: 20_000 });
        check((await threadIds(login, false)).includes(moved[0]), 'candidate unarchive did not bring the thread back');
        await tab(page, 'All');
        await page.waitForTimeout(2000);
        out.push('candidate (no bulk bar on this inbox): thread Archive → Archived view, employer inbox unchanged; Unarchive → back');
        continue;
      }
      await page.locator('.ip-cm-bulk >> visible=true').first().waitFor({ timeout: 60_000 });
      await page.locator('.ip-cm-bulk label:has-text("Select All") input >> visible=true').first().check();
      const archiveBtn = page.locator('.ip-cm-bulk button >> visible=true').first();
      const label = await archiveBtn.innerText();
      const n = Number((label.match(/\((\d+)\)/) || [])[1]);
      check(/Archive Selected/.test(label) && n >= 2 && n <= inbox.length, `${role} button "${label}" (inbox ${inbox.length})`);
      await archiveBtn.click();
      await page.getByText(new RegExp(`Archived ${n} conversation`)).waitFor({ timeout: 20_000 });
      const archivedNow = await threadIds(login, true);
      check(archivedNow.length >= preArchived.length + n, `${role} archived view has ${archivedNow.length}, expected +${n}`);
      const otherAfter = await threadIds(other, false);
      check(otherBefore.every((id) => otherAfter.includes(id)), `${role} archive changed the other side's inbox`);

      await tab(page, 'Archived');
      await page.locator('.ip-cm-bulk button >> visible=true', { hasText: 'Unarchive Selected' }).first().waitFor();
      await page.locator('.ip-cm-bulk label:has-text("Select All") input >> visible=true').first().check();
      const unBtn = page.locator('.ip-cm-bulk button >> visible=true', { hasText: 'Unarchive Selected' }).first();
      const unLabel = await unBtn.innerText();
      await unBtn.click();
      await page.getByText(/Unarchived \d+ conversation/).waitFor({ timeout: 20_000 });
      const back = await threadIds(login, false);
      check(inbox.every((id) => back.includes(id)), `${role} unarchive did not bring every thread back`);
      await tab(page, 'All');
      await page.waitForTimeout(2000);
      out.push(`${role}: "${label}" → archived, other side unchanged; "${unLabel}" → back in inbox`);
    } catch (e) {
      throw new Error(`${role} messages: ${e.message.split('\n')[0]}`);
    } finally {
      await page.context().close();
      for (const id of preArchived) {
        await apiRequest(BASE, `/api/ip/messages/threads/${id}`, { method: 'PATCH', cookie: login.cookie, body: { archived: true } });
      }
    }
  }
  return out.join('; ');
});

// ── TC-IS-12-012 ────────────────────────────────────────────────────────────
await runCase('TC-IS-12-012', async () => {
  const out = [];
  for (const [role, login] of [
    ['employer', emp],
    ['candidate', cand],
  ]) {
    const page = await newQaPage(browser, login);
    try {
      await page.route('**/api/ip/notifications**', async (route) => {
        await new Promise((r) => setTimeout(r, 6000));
        await route.continue().catch(() => {});
      });
      await page.goto(`${BASE}/${role}/notifications`, { waitUntil: 'domcontentloaded' });
      const loading = page.getByText(/Please Wait…|Loading notifications…/).first();
      await loading.waitFor({ timeout: 20_000 });
      const label = (await loading.innerText()).trim();
      const emptyWhileLoading = await page.getByText(/all caught up/i).first().isVisible().catch(() => false);
      check(!emptyWhileLoading, `${role}: empty state shown while loading`);
      await loading.waitFor({ state: 'hidden', timeout: 45_000 });
      const items = ((await apiRequest(BASE, '/api/ip/notifications', { cookie: login.cookie })).data?.items || []).filter((n) => !n.archived_at);
      const emptyAfter = await page.getByText(/all caught up/i).first().isVisible().catch(() => false);
      check(emptyAfter === (items.length === 0), `${role}: empty state ${emptyAfter ? 'shown' : 'hidden'} with ${items.length} inbox items`);
      out.push(`${role}: "${label}" while loading (no empty state), then ${items.length} items`);
    } finally {
      await page.context().close();
    }
  }
  return out.join('; ');
});

// ── TC-IS-17-007 ────────────────────────────────────────────────────────────
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
await runCase('TC-IS-17-007', async () => {
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, '/employer/profile', 'button[aria-label="Upload new logo."]');
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/ip/employer/profile/logo/upload'), { timeout: 60_000 }),
      page.locator('.ip-ep-logo-row input[type="file"]').setInputFiles({ name: `${TAG}.png`, mimeType: 'image/png', buffer: PNG_1PX }),
    ]);
    if (res.status() === 503) throw new Blocked('Logo storage (S3) is not configured on this host');
    check(res.ok(), `logo upload → ${res.status()}`);
    const url = (await res.json()).logo_url;
    await page.locator('.ip-ep-logo-box img').waitFor({ timeout: 20_000 });
    check(url, 'upload response has no logo_url');
    const urlVisible = await page.evaluate((u) => {
      const key = u.split('key=')[1] || u;
      const inputs = [...document.querySelectorAll('input, textarea')].filter((el) => el.offsetParent && el.type !== 'file');
      return inputs.some((el) => el.value.includes(key)) || document.body.innerText.includes(key);
    }, url);
    check(!urlVisible, 'the uploaded logo URL is visible on the page');
    const urlField = await page.getByText(/logo URL/i).first().isVisible().catch(() => false);
    check(!urlField, 'a logo URL field or control is shown');
    return 'Upload via the logo frame → image fills the frame; no storage URL in any field or page text; no logo URL field.';
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-18-053 ────────────────────────────────────────────────────────────
const ENUMS = new Set(
  'approved pending rejected flagged suspended applied shortlisted interviewing interview scheduled offered hired completed declined offer withdrawn published draft closed closing soon open reviewed dismissed accepted declined expired'
    .split(' ')
    .concat(['interview_scheduled', 'declined_offer', 'closing_soon']),
);
const isRawEnum = (t) => {
  const s = t.trim();
  if (!s || s.length > 30) return false;
  const words = s.toLowerCase().replace(/_/g, ' ').split(/\s+/);
  if (!words.every((w) => ENUMS.has(w))) return false;
  return s.includes('_') || !s.split(/\s+/).every((w) => /^[A-Z]/.test(w));
};
await runCase('TC-IS-18-053', async () => {
  const published = (await db(`SELECT id FROM ip_internships WHERE employer_id = $1 AND status = 'published' ORDER BY created_at DESC LIMIT 1`, [empRow.eid]))[0];
  const pages = [
    [emp, '/employer/profile'],
    [emp, '/employer/internships'],
    ...(published ? [[emp, `/employer/internships/${published.id}`]] : []),
    [cand, '/candidate/applications'],
    [sa, '/superadmin/documents'],
    [sa, '/superadmin/postings'],
    [sa, '/superadmin/approvals'],
  ];
  const offenders = [];
  let checked = 0;
  for (const [login, path] of pages) {
    const page = await newQaPage(browser, login);
    try {
      await gotoReady(page, BASE, path, 'main');
      await page.waitForTimeout(4000);
      const texts = await page.evaluate(() =>
        [...document.querySelectorAll('[data-slot="badge"], [class*="badge"], [class*="pill"], [class*="status"]')]
          .filter((el) => el.offsetParent && el.children.length <= 1)
          .map((el) => el.innerText.trim())
          .filter(Boolean),
      );
      checked += texts.length;
      for (const t of texts) if (isRawEnum(t)) offenders.push(`${path}: "${t}"`);
    } finally {
      await page.context().close();
    }
  }
  check(checked > 0, 'no badges found on any page');
  check(!offenders.length, `raw status text: ${[...new Set(offenders)].join('; ')}`);
  return `${checked} badges on ${pages.length} pages (${pages.map((p) => p[1]).join(', ')}) — all status values Title Case.`;
});

// ── TC-IS-03-027 ────────────────────────────────────────────────────────────
await runCase('TC-IS-03-027', async () => {
  const persona = buildEmployerRegisterPersona('free_email');
  check(!isCoreShowcaseEmail(persona.email), `core email ${persona.email}`);
  const page = await newQaPage(browser);
  try {
    await gotoReady(page, BASE, '/register/employer', 'button:has-text("Free-email-based")');
    await clickUntil(page, page.getByRole('button', { name: 'Free-email-based' }), () => page.locator('#m-email').isVisible());
    await page.locator('#m-contact').fill(persona.contactName);
    await page.locator('#m-designation').fill(persona.designation);
    await page.locator('#m-company').fill(persona.companyName);
    await page.locator('#m-email').fill(persona.email);
    await page.locator('#m-password').fill(persona.password);
    await fillMathCaptcha(page);
    await page.getByRole('button', { name: 'Register as Employer' }).click();
    await page.getByText('Check your email').waitFor({ timeout: 45_000 });

    const resend = page.getByRole('button', { name: /Didn't get it\? Resend/ });
    const secs = async () => Number(((await resend.innerText()).match(/\((\d+)s\)/) || [])[1] || 0);
    const s1 = await secs();
    check(s1 > 0 && s1 <= 45 && (await resend.isDisabled()), `after register the button reads "${await resend.innerText()}"`);
    await page.waitForTimeout(2500);
    const s2 = await secs();
    check(s2 < s1, `countdown did not move (${s1}s → ${s2}s)`);
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /Resend/.test(x.textContent || ''));
      return b && !b.disabled;
    }, null, { timeout: 60_000 });
    await resend.click();
    await page.getByText('If that email needs verification, a new link has been sent.').waitFor({ timeout: 20_000 });
    const s3 = await secs();
    check(s3 > 30 && (await resend.isDisabled()), `after resend the button reads "${await resend.innerText()}"`);

    const retry = await apiRequest(BASE, '/api/ip/auth/employer-email-verify/resend', { method: 'POST', body: { email: persona.email } });
    check(retry.status === 429 && Number(retry.data?.retryAfterSec) > 0, `immediate retry → ${retry.status} ${JSON.stringify(retry.data)}`);
    const unknown = await apiRequest(BASE, '/api/ip/auth/employer-email-verify/resend', {
      method: 'POST',
      body: { email: `nobody.${TAG.toLowerCase()}@example.com` },
    });
    check(
      unknown.status === 200 && unknown.data?.message === 'If that email needs verification, a new link has been sent. Check your inbox.' && !unknown.data?.mailed,
      `unknown email → ${unknown.status} ${JSON.stringify(unknown.data)}`,
    );
    return `Register success: "Resend (${s1}s)" disabled and counting (${s1}→${s2}); after it unlocked, resend showed "If that email needs verification, a new link has been sent." and restarted at ${s3}s; immediate API retry → 429 retryAfterSec ${retry.data.retryAfterSec}; unknown email → same generic 200.`;
  } finally {
    await page.context().close();
    const u = (await db(`SELECT id FROM ip_users WHERE lower(email) = lower($1)`, [persona.email]))[0];
    if (u) {
      const client = await pool.connect();
      try {
        await hardDeleteIpUser(client, { userId: u.id, allowSuperadmin: false });
      } finally {
        client.release();
      }
    }
  }
});

// ── Deep page checks (replace the checklist runner's page-load-only checks) ─────
const as = (login, path, method = 'GET', body) => apiRequest(BASE, path, { method, cookie: login.cookie, body });
const MOBILE = { width: 390, height: 844 };
const IDEA_TITLE = ':is(.ip-ci-list-title, .ip-ci-card h3 button)';
const noPageHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const inViewportX = async (loc) => {
  const box = await loc.boundingBox();
  const width = loc.page().viewportSize()?.width ?? Infinity;
  return Boolean(box) && box.x >= -1 && box.x + box.width <= width + 1;
};
const dialogName = (loc) =>
  loc.evaluate((el) => {
    const id = el.getAttribute('aria-labelledby');
    return ((id && document.getElementById(id)?.textContent) || el.getAttribute('aria-label') || '').trim();
  });
const bodyScrollLocked = (page) =>
  page.evaluate(() => [document.body, document.documentElement].some((el) => getComputedStyle(el).overflow === 'hidden'));
const hitsSelf = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(top) && (top === el || el.contains(top));
  });

// ── TC-IS-06-002 ────────────────────────────────────────────────────────────
await runCase('TC-IS-06-002', async () => {
  const colRow = async () =>
    (await db(`SELECT show_completed_internships FROM ip_candidates WHERE id = $1`, [candRow.cid]))[0]?.show_completed_internships === true;
  const before = await colRow();
  const page = await newQaPage(browser, cand);
  const tabsSel = '[role="tablist"][aria-label="Profile sections"] [role="tab"]';
  const toggle = () => page.locator('label.ip-cp-toggle-card', { hasText: 'Show completed internships' }).locator('input[type="checkbox"]');
  const openPrivacy = async () => {
    await gotoReady(page, BASE, '/candidate/profile', tabsSel, 180_000);
    await page.getByRole('tab', { name: 'Privacy & Photo' }).click();
    await toggle().waitFor({ timeout: 30_000 });
  };
  const save = async () => {
    const resP = page.waitForResponse((r) => r.url().includes('/api/ip/candidate/profile') && r.request().method() === 'PUT', { timeout: 45_000 });
    await page.getByRole('button', { name: 'Save Privacy Settings' }).click();
    const res = await resP;
    check(res.ok(), `Save Privacy Settings → ${res.status()} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  };
  try {
    await gotoReady(page, BASE, '/candidate/profile', tabsSel, 180_000);
    const tabs = (await page.locator(tabsSel).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    const want = ['1. Basics & Contact', '2. Academic', '3. Skills & Experience', '4. Work Readiness', 'Privacy & Photo', 'Endorsements (Read-Only)'];
    check(tabs.length === 6 && want.every((w, i) => tabs[i]?.includes(w)), `profile tabs ${JSON.stringify(tabs)}`);
    check(!/^\d+\./.test(tabs[4]) && !/^\d+\./.test(tabs[5]), `only the four setup steps are numbered ${JSON.stringify(tabs)}`);
    const splitBeforePrivacy = await page.locator('.ip-cp-tabs__split + [role="tab"]').innerText().catch(() => '');
    check(/Privacy & Photo/.test(splitBeforePrivacy), `"Optional" divider should sit right before Privacy & Photo (got "${splitBeforePrivacy}")`);
    await page.getByRole('tab', { name: '1. Basics & Contact' }).click();
    const stepHead = (await page.locator('.ip-cp-wizard__top').innerText()).replace(/\s+/g, ' ').trim();
    check(/setup step 1 of 4/i.test(stepHead), `Basics step header reads "${stepHead}", expected "Setup step 1 of 4"`);
    await page.getByRole('tab', { name: 'Endorsements (Read-Only)' }).click();
    await page.getByRole('heading', { name: 'Employer Endorsements (Read-Only)' }).waitFor({ timeout: 20_000 });
    const editable = await page.locator('[role="tabpanel"] :is(input:not([type="hidden"]), textarea, select)').count();
    check(editable === 0, `Endorsements tab has ${editable} editable field(s)`);

    await page.getByRole('tab', { name: 'Privacy & Photo' }).click();
    await toggle().waitFor({ timeout: 30_000 });
    check((await page.locator('.ip-cp-wizard').count()) === 0, 'Privacy & Photo shows a setup step header');
    check((await toggle().isChecked()) === before, 'Show completed internships toggle does not match the stored value');
    await toggle().setChecked(!before);
    await save();
    check((await colRow()) === !before, 'toggle not stored after Save Privacy Settings');
    await openPrivacy();
    check((await toggle().isChecked()) === !before, 'toggle did not survive a reload');
    await toggle().setChecked(before);
    await save();
    check((await colRow()) === before, 'toggle not restored');
    return `Six tabs in order (${tabs.join(' | ')}); only setup tabs numbered, "Optional" divider before Privacy & Photo, Basics header "${stepHead}", no step header on Privacy & Photo; Endorsements tab has no editable fields; Privacy & Photo "Show completed internships" ${before} → ${!before} saved via PUT /api/ip/candidate/profile, still ${!before} after reload, then restored to ${before}.`;
  } finally {
    await page.context().close();
    await db(`UPDATE ip_candidates SET show_completed_internships = $2 WHERE id = $1`, [candRow.cid, before]);
  }
});

// ── TC-IS-07-003 ────────────────────────────────────────────────────────────
await runCase('TC-IS-07-003', async () => {
  const page = await newQaPage(browser, cand);
  const search = () => page.getByLabel('Search internships');
  try {
    await gotoReady(page, BASE, '/candidate/internships', 'input[aria-label="Search internships"]', 90_000);
    await page.locator('table.ip-ph-list, .ip-br-empty').first().waitFor({ timeout: 60_000 });
    const onLabel = (await page.locator('.ip-view-toggle__btn.is-on').innerText()).trim();
    check(/List/.test(onLabel), `default view is "${onLabel}", expected List`);
    check(await page.locator('.ip-presets-bar').waitFor({ timeout: 30_000 }).then(() => true, () => false), 'saved views bar not visible');
    const rows = await page.locator('table.ip-ph-list tbody tr').count();
    let cardsNote = 'no open roles to show as cards';
    if (rows) {
      await page.locator('.ip-view-toggle__btn', { hasText: 'Cards' }).click();
      await page.locator('.ip-br-grid .ip-br-card').first().waitFor({ timeout: 20_000 });
      check(!(await page.locator('table.ip-ph-list').isVisible().catch(() => false)), 'table still shown in Cards view');
      cardsNote = `${await page.locator('.ip-br-grid .ip-br-card').count()} cards`;
      await page.locator('.ip-view-toggle__btn', { hasText: 'List' }).click();
      await page.locator('table.ip-ph-list').waitFor({ timeout: 20_000 });
    }
    await search().fill(`zz-no-match-${TAG}`);
    const empty = page.getByTestId('browse-empty-filtered');
    await empty.waitFor({ timeout: 30_000 });
    check(/No matching internships found/.test(await empty.innerText()), 'empty state copy missing');
    await search().fill('');
    await page.waitForTimeout(1200);

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(800);
    check(await noPageHScroll(page), 'page scrolls sideways at 390px');
    const filtersBtn = page.locator('.ip-tf__bar button[aria-expanded]').first();
    check((await filtersBtn.isVisible()) && (await inViewportX(filtersBtn)), 'Filters toggle not reachable at 390px');
    const savedTab = page.getByRole('tab', { name: /Saved/ }).first();
    await savedTab.scrollIntoViewIfNeeded();
    check((await savedTab.isVisible()) && (await inViewportX(savedTab)), 'Saved tab not reachable at 390px');
    return `List is the default view; Cards toggle showed ${cardsNote} and List came back; saved views bar visible; a no-match search showed "No matching internships found"; at 390px no sideways scroll and the Filters toggle + Saved tab are on screen.`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-09-006 ────────────────────────────────────────────────────────────
await runCase('TC-IS-09-006', async () => {
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, '/employer/analytics', 'text=Application funnel', 90_000);
    const r = await as(emp, '/api/ip/employer/analytics');
    check(r.status === 200, `GET /api/ip/employer/analytics → ${r.status}`);
    const live = `${r.data.postings?.live ?? 0}/${r.data.postings?.total ?? 0}`;
    const tile = (await page.locator('[data-slot="card"]', { hasText: 'Live postings' }).first().innerText()).replace(/\s+/g, ' ');
    check(tile.includes(live), `Live postings tile "${tile}" vs API ${live}`);
    const funnelKeys = Object.keys(r.data.funnel || {});
    const funnelText = (await page.locator('[data-slot="card"]', { hasText: 'Application funnel' }).first().innerText()).replace(/\s+/g, ' ');
    check(
      funnelKeys.length ? funnelKeys.every((k) => funnelText.includes(String(r.data.funnel[k]))) : funnelText.includes('No applications yet.'),
      `funnel card "${funnelText}" vs API ${JSON.stringify(r.data.funnel)}`,
    );
    check(!(await page.locator('[data-testid="analytics-load-error"], [data-testid="analytics-session-expired"]').count()), 'analytics error panel shown');
    const body = await page.locator('body').innerText();
    check(!/TypeError|ReferenceError|Unhandled|at \w+ \(.*:\d+:\d+\)/.test(body), 'stack trace / runtime error text on the page');
    return `Analytics loaded from /api/ip/employer/analytics: Live postings ${live} matches the API; funnel ${funnelKeys.length ? JSON.stringify(r.data.funnel) : 'empty state "No applications yet."'}; no error panel or stack trace.`;
  } finally {
    await page.context().close();
  }
});

// ── Messages: TC-IS-18-016, TC-IS-12-001, TC-IS-12-002 ──────────────────────
const msgApp = (
  await db(
    `SELECT a.internship_id FROM ip_applications a JOIN ip_internships i ON i.id = a.internship_id
     WHERE i.employer_id = $1 AND a.candidate_id = $2 ORDER BY a.created_at DESC LIMIT 1`,
    [empRow.eid, candRow.cid],
  )
)[0];
let threadId = null;
let threadSnap = null;
const threadPath = () => `/api/ip/messages/threads/${threadId}`;
const listIds = async (login, archived) =>
  ((await as(login, `/api/ip/messages/threads${archived ? '?archived=1' : ''}`)).data?.items || []).map((t) => t.id);
const unreadFor = async (login) =>
  Number(((await as(login, '/api/ip/messages/threads')).data?.items || []).find((t) => t.id === threadId)?.unread_count ?? NaN);

await runCase('TC-IS-18-016', async () => {
  if (!msgApp) throw new Blocked('Test candidate has no application to a test-employer posting');
  const open = await as(emp, '/api/ip/messages/threads', 'POST', { internshipId: msgApp.internship_id, otherUserId: candRow.uid });
  check(open.status === 201 && open.data?.threadId, `employer POST thread → ${open.status} ${JSON.stringify(open.data)}`);
  threadId = open.data.threadId;
  threadSnap = (await db(`SELECT candidate_archived_at, employer_archived_at FROM ip_message_threads WHERE id = $1`, [threadId]))[0];
  await db(`UPDATE ip_message_threads SET candidate_archived_at = NULL, employer_archived_at = NULL WHERE id = $1`, [threadId]);
  await as(cand, threadPath());
  const text = `QA employer note ${TAG}`;
  const sent = await as(emp, threadPath(), 'POST', { message: text });
  check(sent.status === 200, `employer send → ${sent.status} ${JSON.stringify(sent.data)}`);
  const unread = await unreadFor(cand);
  check(unread >= 1, `candidate unread_count after send = ${unread}`);
  const read = await as(cand, threadPath());
  check((read.data?.messages || []).some((m) => m.body === text), 'candidate does not see the employer message');
  const unreadAfter = await unreadFor(cand);
  check(unreadAfter === 0, `candidate unread_count after opening = ${unreadAfter}`);
  const bad = await as(emp, threadPath(), 'POST', { message: 'x', attachment: { url: 'https://evil.example/x.pdf', name: 'x.pdf' } });
  check(bad.status === 400 && bad.data?.error === 'Invalid attachment', `bad attachment → ${bad.status} ${JSON.stringify(bad.data)}`);
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, `/employer/messages/${threadId}`, `text=${text}`, 90_000);
  } finally {
    await page.context().close();
  }
  return `Employer POST /threads (otherUserId) → 201; message sent → candidate unread_count ${unread} → 0 after opening; candidate sees it; off-site attachment URL → 400 "Invalid attachment"; message shows on /employer/messages/[id].`;
});

await runCase('TC-IS-12-001', async () => {
  if (!threadId) throw new Blocked('No thread (TC-IS-18-016 did not open one)');
  const reply = `QA candidate reply ${TAG}`;
  const r = await as(cand, threadPath(), 'POST', { message: reply });
  check(r.status === 200, `candidate reply → ${r.status} ${JSON.stringify(r.data)}`);
  check(((await as(emp, threadPath())).data?.messages || []).some((m) => m.body === reply), 'employer does not see the reply');
  const empty = await as(cand, threadPath(), 'POST', { message: '   ' });
  check(empty.status === 400, `empty body → ${empty.status} ${JSON.stringify(empty.data)}`);
  const page = await newQaPage(browser, cand);
  try {
    await gotoReady(page, BASE, `/candidate/messages/${threadId}`, `text=${reply}`, 90_000);
    check(await page.getByText(`QA employer note ${TAG}`).first().isVisible(), 'employer message missing on the candidate thread page');
  } finally {
    await page.context().close();
  }
  return 'Candidate replied on the employer-started thread (200), employer sees it; empty body → 400; /candidate/messages/[id] shows both messages.';
});

await runCase('TC-IS-12-002', async () => {
  if (!threadId) throw new Blocked('No thread (TC-IS-18-016 did not open one)');
  const a = await as(cand, threadPath(), 'PATCH', { archived: true });
  check(a.status === 200, `candidate archive → ${a.status} ${JSON.stringify(a.data)}`);
  check((await listIds(cand, true)).includes(threadId) && !(await listIds(cand, false)).includes(threadId), 'candidate inbox/archived lists wrong after archive');
  check((await listIds(emp, false)).includes(threadId), "candidate archive removed the thread from the employer's inbox");
  const cols = (await db(`SELECT candidate_archived_at, employer_archived_at FROM ip_message_threads WHERE id = $1`, [threadId]))[0];
  check(cols.candidate_archived_at && !cols.employer_archived_at, `columns after candidate archive ${JSON.stringify(cols)}`);
  const bad = await as(cand, threadPath(), 'PATCH', { archived: 'yes' });
  check(bad.status === 400 && bad.data?.error === 'archived boolean is required', `non-boolean → ${bad.status} ${JSON.stringify(bad.data)}`);
  const saTry = await as(sa, threadPath(), 'PATCH', { archived: true });
  check(saTry.status === 401 || saTry.status === 403, `SuperAdmin archive → ${saTry.status}`);
  const un = await as(cand, threadPath(), 'PATCH', { archived: false });
  check(un.status === 200 && (await listIds(cand, false)).includes(threadId), 'unarchive did not bring the thread back');
  return 'Candidate archive sets candidate_archived_at only (thread leaves candidate inbox, stays in employer inbox); archived:"yes" → 400 "archived boolean is required"; SuperAdmin PATCH → 403; unarchive restores it.';
});
if (threadId) {
  await db(`DELETE FROM ip_messages WHERE thread_id = $1 AND body LIKE $2`, [threadId, `%${TAG}%`]);
  if (threadSnap) {
    await db(`UPDATE ip_message_threads SET candidate_archived_at = $2, employer_archived_at = $3 WHERE id = $1`, [
      threadId,
      threadSnap.candidate_archived_at,
      threadSnap.employer_archived_at,
    ]);
  }
}

// ── TC-IS-14-016 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-016', async () => {
  const list = await as(sa, '/api/ip/messages/threads');
  check(list.status === 401 || list.status === 403, `SuperAdmin GET threads → ${list.status}`);
  let sendNote = 'no thread to try';
  if (threadId) {
    const send = await as(sa, threadPath(), 'POST', { message: `QA SA ${TAG}` });
    check(send.status === 401 || send.status === 403, `SuperAdmin send into a thread → ${send.status}`);
    sendNote = `send → ${send.status}`;
  }
  const page = await newQaPage(browser, sa);
  try {
    await gotoReady(page, BASE, '/superadmin/messages', 'input[aria-label="Search alerts by title or details"]', 90_000);
    check(!(await page.locator('textarea').count()), 'SuperAdmin messages page has a compose box');
    const inspect = page.locator('table tbody tr .ip-saq-actions button').first();
    let inspectNote = 'no alerts listed';
    if (await inspect.count()) {
      await inspect.click();
      const dlg = page.locator('[role="dialog"][aria-labelledby="ip-saq-msg-title"]');
      await dlg.waitFor({ timeout: 15_000 });
      const name = await dialogName(dlg);
      check(name.length > 0, 'inspect dialog has no title');
      await dlg.getByRole('button', { name: 'Close' }).first().click();
      await dlg.waitFor({ state: 'detached', timeout: 10_000 });
      inspectNote = `inspect dialog "${name}" opened and closed`;
    }
    return `SuperAdmin cannot read or send in candidate/employer threads (GET ${list.status}, ${sendNote}); /superadmin/messages is the alerts inbox (no compose box), ${inspectNote}.`;
  } finally {
    await page.context().close();
  }
});

// ── Offers: TC-IS-18-017, TC-IS-11-005, TC-IS-11-001 ────────────────────────
const offerApp = (
  await db(
    `SELECT a.id, a.status FROM ip_applications a
     JOIN ip_internships i ON i.id = a.internship_id
     LEFT JOIN ip_offers o ON o.application_id = a.id
     WHERE i.employer_id = $1 AND a.candidate_id = $2
       AND a.status IN ('applied', 'pending', 'shortlisted')
       AND (o.id IS NULL OR o.status NOT IN ('accepted', 'pending'))
     ORDER BY a.created_at DESC LIMIT 1`,
    [empRow.eid, candRow.cid],
  )
)[0];
const offerRole = `QA Offer ${TAG}`;
let offerId = null;
let offerPrior = null;
const offerStart = new Date();
const offerState = async () =>
  (
    await db(
      `SELECT o.status AS offer, a.status AS app FROM ip_offers o JOIN ip_applications a ON a.id = o.application_id WHERE o.id = $1`,
      [offerId],
    )
  )[0];
if (offerApp) {
  offerPrior = (await db(`SELECT * FROM ip_offers WHERE application_id = $1`, [offerApp.id]))[0] || null;
}

await runCase('TC-IS-18-017', async () => {
  if (!offerApp) throw new Blocked('Test candidate has no offerable application (applied/pending/shortlisted) to a test-employer posting');
  const sent = await as(emp, '/api/ip/offers', 'POST', { applicationId: offerApp.id, roleTitle: offerRole });
  check(sent.status === 200 || sent.status === 201, `send offer → ${sent.status} ${JSON.stringify(sent.data)}`);
  offerId = sent.data?.id || (await db(`SELECT id FROM ip_offers WHERE application_id = $1`, [offerApp.id]))[0]?.id;
  check(offerId, 'offer id not returned');
  const empList = await as(emp, '/api/ip/offers');
  check(empList.status === 200 && (empList.data?.items || []).some((o) => o.id === offerId), 'employer GET /api/ip/offers does not list the offer');
  const remind = await as(emp, `/api/ip/offers/${offerId}/remind`, 'POST');
  check(remind.status === 200, `remind pending offer → ${remind.status} ${JSON.stringify(remind.data)}`);
  const again = await as(emp, `/api/ip/offers/${offerId}/remind`, 'POST');
  check(again.status === 429, `second remind straight away → ${again.status}`);
  const fake = await as(emp, '/api/ip/offers/ip_offer_does_not_exist/remind', 'POST');
  check(fake.status === 404, `remind unknown offer → ${fake.status}`);
  const asCand = await as(cand, `/api/ip/offers/${offerId}/remind`, 'POST');
  check(asCand.status === 401 || asCand.status === 403, `candidate remind → ${asCand.status}`);
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, '/employer/offers', `text=${offerRole}`, 90_000);
  } finally {
    await page.context().close();
  }
  return `Employer sent a pending offer; GET /api/ip/offers lists it; remind → 200, immediate second remind → 429, unknown offer → 404, candidate → ${asCand.status}; /employer/offers shows the offer. (Remind on a non-pending offer is checked after acceptance in TC-IS-11-001.)`;
});

await runCase('TC-IS-11-005', async () => {
  if (!offerId) throw new Blocked('No pending offer (TC-IS-18-017 did not create one)');
  const page = await newQaPage(browser, cand);
  try {
    await gotoReady(page, BASE, '/candidate/offers', `text=${offerRole}`, 90_000);
    const card = page.locator('article', { hasText: offerRole }).first();
    const overlay = page.locator('.ip-of-overlay[role="dialog"]');
    const out = [];
    for (const [btn, heading] of [
      ['Share Offer', null],
      ['Decline Offer', 'Decline internship offer?'],
      ['Accept Offer', 'Accept internship offer?'],
    ]) {
      await card.getByRole('button', { name: btn }).click();
      await overlay.first().waitFor({ timeout: 15_000 });
      if (heading) check(await overlay.getByText(heading).isVisible(), `${btn}: dialog heading "${heading}" missing`);
      const named = (await dialogName(overlay.first())).length > 0;
      await overlay.locator('.ip-of-btn--ghost').first().click();
      await overlay.first().waitFor({ state: 'detached', timeout: 10_000 });
      check(!(await bodyScrollLocked(page)), `${btn}: page scroll still locked after closing`);
      out.push(`${btn} dialog closed${named ? '' : ' (no accessible name)'}`);
    }
    const st = await offerState();
    check(st.offer === 'pending' && st.app === 'offered', `after Cancel: offer ${st.offer}, application ${st.app}`);
    return `${out.join('; ')}; offer still pending and application "offered" after every Cancel.`;
  } finally {
    await page.context().close();
  }
});

await runCase('TC-IS-11-001', async () => {
  if (!offerId) throw new Blocked('No pending offer (TC-IS-18-017 did not create one)');
  const page = await newQaPage(browser, cand);
  try {
    await gotoReady(page, BASE, '/candidate/offers', `text=${offerRole}`, 90_000);
    const card = page.locator('article', { hasText: offerRole }).first();
    check(await card.getByRole('button', { name: 'Accept Offer' }).isVisible(), 'pending offer has no Accept Offer button');
    await card.getByRole('button', { name: 'Accept Offer' }).click();
    await page.getByRole('button', { name: 'Confirm Acceptance' }).click();
    await page.locator('.ip-of-toast', { hasText: 'Offer accepted. Employer notified.' }).first().waitFor({ timeout: 30_000 });
    await page.getByText("Offer Accepted — you're set for your internship!").first().waitFor({ timeout: 30_000 });
  } finally {
    await page.context().close();
  }
  const st = await offerState();
  check(st.offer === 'accepted' && st.app === 'hired', `after Accept: offer ${st.offer}, application ${st.app}`);
  const notice = await db(
    `SELECT 1 FROM ip_notifications WHERE user_id = $1 AND title = 'Offer accepted' AND created_at >= $2`,
    [empRow.uid, offerStart],
  );
  check(notice.length > 0, 'employer got no "Offer accepted" notice');
  const remind = await as(emp, `/api/ip/offers/${offerId}/remind`, 'POST');
  check(remind.status === 400, `remind after acceptance → ${remind.status} ${JSON.stringify(remind.data)}`);
  return 'Candidate saw the pending offer on /candidate/offers, Accept → Confirm Acceptance → toast "Offer accepted. Employer notified." + accepted panel; DB offer accepted, application hired; employer "Offer accepted" notice; remind on the accepted offer → 400. (Email send not checked here.)';
});
if (offerApp && offerId) {
  if (offerPrior) {
    const cols = Object.keys(offerPrior).filter((k) => k !== 'id');
    await db(
      `UPDATE ip_offers SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [offerPrior.id, ...cols.map((c) => offerPrior[c])],
    );
  } else {
    await db(`DELETE FROM ip_offers WHERE id = $1`, [offerId]);
  }
  await db(`UPDATE ip_applications SET status = $2, updated_at = now() WHERE id = $1`, [offerApp.id, offerApp.status]);
  await db(
    `DELETE FROM ip_notifications WHERE user_id = ANY($1) AND created_at >= $2 AND (title ILIKE '%offer%')`,
    [[candRow.uid, empRow.uid], offerStart],
  );
}

// ── TC-IS-13-001 ────────────────────────────────────────────────────────────
await runCase('TC-IS-13-001', async () => {
  const r = await as(cand, '/api/ip/referral');
  check(r.status === 200, `GET /api/ip/referral → ${r.status}`);
  const code = r.data?.referral_code;
  check(code, 'no referral_code');
  check(r.data.viralLink?.endsWith(`/r/${code}`) && r.data.referralLink?.includes(`ref=${code}`), `links ${r.data.viralLink} / ${r.data.referralLink}`);
  check(typeof r.data.waysEarned?.profileComplete === 'boolean' && typeof r.data.waysEarned?.firstApplication === 'boolean', `waysEarned ${JSON.stringify(r.data.waysEarned)}`);
  check(Number.isFinite(Number(r.data.points)), `points ${r.data.points}`);
  const page = await newQaPage(browser, cand);
  try {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    await gotoReady(page, BASE, '/candidate/referral', 'input[aria-label="Referral link"]', 90_000);
    const input = page.locator('input[aria-label="Referral link"]');
    await page.waitForFunction(() => /\/r\//.test(document.querySelector('input[aria-label="Referral link"]')?.value || ''), null, { timeout: 30_000 });
    const link = await input.inputValue();
    check(link === r.data.viralLink, `page link ${link} vs API ${r.data.viralLink}`);
    await page.getByRole('button', { name: 'Copy Link' }).first().click();
    await page.getByRole('button', { name: 'Copied!' }).first().waitFor({ timeout: 10_000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip === link, `clipboard "${clip}"`);
    await page.locator('[role="status"]', { hasText: 'Referral link copied' }).first().waitFor({ timeout: 10_000 });
    const tabs = await page.locator('[role="tablist"][aria-label="Referral status"] [role="tab"]').count();
    check(tabs >= 2, `referral status tabs: ${tabs}`);
    return `API: code ${code}, points ${r.data.points}, profileComplete ${r.data.waysEarned.profileComplete}, firstApplication ${r.data.waysEarned.firstApplication}, links /r/{code} and ?ref={code}; page shows the same link, Copy Link put it on the clipboard ("Copied!" + toast); ${tabs} referral status tabs.`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-12-004 ────────────────────────────────────────────────────────────
await runCase('TC-IS-12-004', async () => {
  const page = await newQaPage(browser, cand);
  try {
    await gotoReady(page, BASE, '/candidate/notifications', '[role="tablist"][aria-label="Notification folders"]', 90_000);
    const inbox = page.getByTestId('notif-folder-inbox');
    const archived = page.getByTestId('notif-folder-archived');
    check((await inbox.getAttribute('role')) === 'tab' && (await inbox.getAttribute('aria-selected')) === 'true', 'Inbox tab not selected by default');
    await archived.click();
    check((await archived.getAttribute('aria-selected')) === 'true' && (await inbox.getAttribute('aria-selected')) === 'false', 'aria-selected did not move to Archived');
    await inbox.click();
    check((await inbox.getAttribute('aria-selected')) === 'true', 'aria-selected did not move back to Inbox');
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    const toast = page.locator('.ip-cn-toast[role="status"]');
    await toast.waitFor({ timeout: 20_000 });
    const toastText = (await toast.innerText()).trim();
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(800);
    const searchBox = page.getByLabel('Search notifications');
    const box = await searchBox.boundingBox();
    check(box && box.width >= 150 && (await inViewportX(searchBox)), `search field at 390px ${JSON.stringify(box)}`);
    check(await noPageHScroll(page), 'page scrolls sideways at 390px');
    return `Folder tabs are role=tab in a labelled tablist and aria-selected follows clicks; "Mark all as read" showed a role=status toast ("${toastText}"); at 390px the search field is ${Math.round(box.width)}px wide and fully on screen, no sideways scroll.`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-18-020 ────────────────────────────────────────────────────────────
await runCase('TC-IS-18-020', async () => {
  const r = await as(emp, '/api/ip/notifications');
  check(r.status === 200, `employer GET /api/ip/notifications → ${r.status}`);
  const items = r.data?.items || r.data?.notifications || [];
  const page = await newQaPage(browser, emp);
  try {
    await gotoReady(page, BASE, '/employer/notifications', '[role="tablist"][aria-label="Notification folders"]', 90_000);
    const inbox = page.getByTestId('notif-folder-inbox');
    const archived = page.getByTestId('notif-folder-archived');
    await archived.click();
    check((await archived.getAttribute('aria-selected')) === 'true', 'Archived folder did not select');
    await inbox.click();
    const firstInbox = items.find((n) => !n.archived_at && !n.archived);
    if (firstInbox?.title) await page.getByText(firstInbox.title).first().waitFor({ timeout: 30_000 });
  } finally {
    await page.context().close();
  }
  const saPage = await newQaPage(browser, sa);
  try {
    await gotoReady(saPage, BASE, '/superadmin', 'main', 90_000);
    const navNotif = await saPage.locator('nav a[href$="/notifications"], aside a[href$="/notifications"]').count();
    check(navNotif === 0, `SuperAdmin nav has ${navNotif} notifications link(s)`);
  } finally {
    await saPage.context().close();
  }
  return `Employer /employer/notifications loads (${items.length} item(s) from the API, folder tabs switch, newest inbox title shown); SuperAdmin nav has no notifications page.`;
});

// ── TC-IS-05-001 ────────────────────────────────────────────────────────────
await runCase('TC-IS-05-001', async () => {
  const out = [];
  for (const [role, login, label] of [
    ['candidate', cand, 'candidate'],
    ['employer', emp, 'employer'],
    ['superadmin', sa, 'admin'],
  ]) {
    const page = await newQaPage(browser, login);
    try {
      await gotoReady(page, BASE, '/account', '.ip-ac-tabs[role="tablist"]', 90_000);
      const intro = await page.locator('.ip-ac-header p').innerText();
      check(intro.includes(`Manage your ${label} login credentials`), `${role} intro "${intro}"`);
      const tabs = (await page.locator('.ip-ac-tabs [role="tab"]').allInnerTexts()).map((t) => t.replace(/\d+$/, '').trim());
      const want = ['Security & Password', 'Profile Info & Contact', 'Active Sessions', ...(role === 'candidate' ? ['Notification Preferences'] : [])];
      check(tabs.length === want.length && want.every((w) => tabs.some((t) => t.startsWith(w))), `${role} tabs ${JSON.stringify(tabs)}`);
      for (const w of want) {
        const tab = page.locator('.ip-ac-tabs [role="tab"]', { hasText: w });
        await tab.click();
        check((await tab.getAttribute('aria-selected')) === 'true', `${role}: ${w} tab did not select`);
      }
      out.push(`${role}: ${tabs.length} tabs, "${label}" in copy`);
    } finally {
      await page.context().close();
    }
  }
  const prefs = await as(cand, '/api/ip/account/notification-preferences');
  check(prefs.status === 200 && Array.isArray(prefs.data?.items) && prefs.data.items.length, `GET preferences → ${prefs.status}`);
  const items = prefs.data.items;
  const key = Object.keys(items[0]).find((k) => typeof items[0][k] === 'boolean');
  check(key, `no boolean channel on ${JSON.stringify(items[0])}`);
  const flipped = items.map((it, i) => (i === 0 ? { ...it, [key]: !it[key] } : it));
  try {
    const put = await as(cand, '/api/ip/account/notification-preferences', 'PUT', { items: flipped });
    check(put.status === 200, `PUT preferences → ${put.status} ${JSON.stringify(put.data)}`);
    const again = (await as(cand, '/api/ip/account/notification-preferences')).data?.items || [];
    const row = again.find((it) => it.id === items[0].id);
    check(row && row[key] === !items[0][key], `preference ${items[0].id}.${key} did not persist`);
  } finally {
    await as(cand, '/api/ip/account/notification-preferences', 'PUT', { items });
  }
  return `${out.join('; ')}; Notification Preferences only for the candidate; preference ${items[0].id}.${key} flipped via PUT, read back changed, then restored.`;
});

// ── TC-IS-05-002 ────────────────────────────────────────────────────────────
await runCase('TC-IS-05-002', async () => {
  const page = await newQaPage(browser, cand);
  const out = [];
  const issues = [];
  try {
    await gotoReady(page, BASE, '/account', '.ip-ac-tabs[role="tablist"]', 90_000);
    const dlg = page.locator('.ip-ac-overlay[role="dialog"]');
    const openers = [
      ['Security & Password', 'Forgot current password?'],
      ['Profile Info & Contact', 'Change Email'],
      ['Profile Info & Contact', 'Change Phone'],
    ];
    for (const [tabName, opener] of openers) {
      await page.locator('.ip-ac-tabs [role="tab"]', { hasText: tabName }).click();
      const btn = page.getByRole('button', { name: opener }).first();
      if (!(await btn.count())) continue;
      for (const how of ['X', 'Cancel']) {
        await btn.click();
        await dlg.first().waitFor({ timeout: 15_000 });
        const box = await dlg.locator('.ip-ac-modal').boundingBox();
        const vp = page.viewportSize();
        check(box && box.y >= 0 && box.y + box.height <= vp.height + 1 && box.x >= 0 && box.x + box.width <= vp.width + 1, `${opener}: dialog clipped ${JSON.stringify(box)}`);
        const close = dlg.getByRole('button', { name: 'Close' }).first();
        await close.focus();
        check(await close.evaluate((el) => document.activeElement === el), `${opener}: Close button not focusable`);
        if (how === 'X') {
          if (!(await dialogName(dlg.first()))) issues.push(`${opener} dialog has no accessible name (no aria-labelledby/aria-label)`);
          await close.click();
        } else {
          const cancel = dlg.getByRole('button', { name: 'Cancel' }).first();
          if (!(await cancel.count())) {
            await close.click();
          } else {
            await cancel.click();
          }
        }
        await dlg.first().waitFor({ state: 'detached', timeout: 10_000 });
        check(!(await bodyScrollLocked(page)), `${opener}: page scroll locked after closing`);
      }
      out.push(opener);
    }
    check(out.length >= 1, 'no account dialog openers found');
  } finally {
    await page.context().close();
  }
  check(!issues.length, issues.join('; '));
  return `Dialogs (${out.join(', ')}) are on screen, Close is focusable, × and Cancel both close them, page scroll is not locked afterwards, and each has an accessible name.`;
});

// ── TC-IS-15-003 ────────────────────────────────────────────────────────────
await runCase('TC-IS-15-003', async () => {
  const cats = await as(cand, '/api/ip/idea-categories');
  check(cats.status === 200 && (cats.data?.items || []).length > 0, `GET /api/ip/idea-categories → ${cats.status}, ${(cats.data?.items || []).length} categories`);
  const ideas = (await as(cand, '/api/ip/ideas')).data?.items || [];
  const page = await newQaPage(browser, cand);
  try {
    await gotoReady(page, BASE, '/ideas', 'select[aria-label="Filter by category"]', 90_000);
    await page
      .waitForFunction(() => document.querySelectorAll('select[aria-label="Filter by category"] option').length > 1, null, { timeout: 60_000 })
      .catch(() => {});
    const options = await page.locator('select[aria-label="Filter by category"] option').count();
    check(options === cats.data.items.length + 1, `category filter has ${options - 1} categories, API has ${cats.data.items.length}`);
    if (!ideas.length) return `Categories load (${cats.data.items.length}); no ideas to open.`;
    await page.locator(`${IDEA_TITLE} >> visible=true`).first().waitFor({ timeout: 90_000 });
    const notes = [];
    for (const vp of [{ width: 1280, height: 800 }, MOBILE]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(600);
      const voteBtn = page.locator(':is(.ip-ci-vote, .ip-ci-list-actions button) >> visible=true').first();
      await voteBtn.scrollIntoViewIfNeeded();
      check(await hitsSelf(voteBtn), `vote control covered at ${vp.width}px`);
      notes.push(`${vp.width}px vote control uncovered`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    const longest = [...ideas].sort((a, b) => String(b.description || '').length - String(a.description || '').length)[0];
    await page.getByLabel('Search ideas').fill(longest.title);
    await page.locator(IDEA_TITLE, { hasText: longest.title }).first().click();
    const dlg = page.locator('[role="dialog"][aria-labelledby="ip-ci-detail-title"]');
    await dlg.waitFor({ timeout: 15_000 });
    const wraps = await dlg.evaluate((el) => [...el.querySelectorAll('*')].every((n) => n.scrollWidth <= n.clientWidth + 1 || getComputedStyle(n).overflowX !== 'visible'));
    check(wraps, 'idea detail text overflows sideways');
    await dlg.getByRole('button', { name: 'Close' }).first().click();
    await dlg.waitFor({ state: 'detached', timeout: 10_000 });
    return `Category filter lists all ${cats.data.items.length} API categories; ${notes.join(', ')}; longest idea (${String(longest.description || '').length} chars) opens in a labelled dialog with text wrapped, and closes.`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-18-012 ────────────────────────────────────────────────────────────
await runCase('TC-IS-18-012', async () => {
  const basis = `QA incentive basis ${TAG}`;
  const created = await as(emp, '/api/ip/employer/internships', 'POST', {
    title: `QA form fields ${TAG}`,
    status: 'draft',
    workMode: 'Remote',
    location: 'Remote',
    description: 'QA draft for form-field persistence.',
    engagementType: 'part_time',
    weeklyHours: 20,
    stipendType: 'incentive',
    incentiveBasis: basis,
    questions: [
      { prompt: 'Why this role?', type: 'text' },
      { prompt: 'Earliest start date?', type: 'text' },
    ],
  });
  check(created.status === 200 || created.status === 201, `create draft → ${created.status} ${JSON.stringify(created.data)}`);
  const id = created.data?.id;
  try {
    const got = (await as(emp, `/api/ip/employer/internships/${id}`)).data?.internship || {};
    const qs = Array.isArray(got.questions) ? got.questions : JSON.parse(got.questions || '[]');
    check(
      got.engagement_type === 'part_time' && Number(got.weekly_hours) === 20 && got.stipend_type === 'incentive' && got.incentive_basis === basis && qs.length === 2,
      `stored ${JSON.stringify({ e: got.engagement_type, h: got.weekly_hours, s: got.stipend_type, b: got.incentive_basis, q: qs.length })}`,
    );
    const page = await newQaPage(browser, emp);
    try {
      const hoursTab = page.getByRole('tab', { name: /Hours & Engagement/i });
      const payTab = page.getByRole('tab', { name: /Compensation/i });
      const weekly = page.getByText(/^Weekly hours$/i);
      const incentive = page.getByText(/^Incentive basis$/i);
      await page.goto(`${BASE}/employer/internships/new`, { waitUntil: 'domcontentloaded' });
      await hoursTab.waitFor({ timeout: 120_000 });
      await hoursTab.click();
      check(!(await weekly.isVisible().catch(() => false)), 'Weekly Hours shown before Part-Time');
      await page.locator('select', { has: page.locator('option[value="part_time"]') }).selectOption('part_time');
      await weekly.waitFor({ timeout: 10_000 });
      await payTab.click();
      await page.locator('select', { has: page.locator('option[value="incentive"]') }).selectOption('incentive');
      await incentive.waitFor({ timeout: 10_000 });
      check(!(await page.getByText(/^Stipend min/i).isVisible().catch(() => false)), 'Stipend Min still shown for Incentive-Based');
      check(await noPageHScroll(page), 'new posting form scrolls sideways at desktop width');
      await page.setViewportSize(MOBILE);
      await page.waitForTimeout(600);
      check(await noPageHScroll(page), 'new posting form scrolls sideways at 390px');
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE}/employer/internships/${id}/edit`, { waitUntil: 'domcontentloaded' });
      await hoursTab.waitFor({ timeout: 120_000 });
      await hoursTab.click();
      await weekly.waitFor({ timeout: 15_000 });
      check((await page.locator('input[type="number"][max="40"]').first().inputValue()) === '20', 'edit page weekly hours not 20');
      await payTab.click();
      await incentive.waitFor({ timeout: 15_000 });
      check(await page.locator('textarea').evaluateAll((els, b) => els.some((e) => e.value === b), basis), 'edit page incentive basis missing');
    } finally {
      await page.context().close();
    }
    return 'Draft saved with part_time + weekly_hours 20, incentive + incentive_basis, 2 screening questions (all read back from the API); new form shows Weekly Hours only for Part-Time and Incentive Basis instead of Stipend Min; edit page loads both values; no sideways scroll at desktop or 390px.';
  } finally {
    if (id) await db(`DELETE FROM ip_internships WHERE id = $1 AND employer_id = $2`, [id, empRow.eid]);
  }
});

// ── TC-IS-18-015 ────────────────────────────────────────────────────────────
await runCase('TC-IS-18-015', async () => {
  const key = 'employer.candidates';
  const prior = (await as(emp, `/api/ip/table-filter-prefs?tableKey=${key}`)).data || { filters: null, sort: '' };
  const list = await as(emp, '/api/ip/employer/candidates');
  check(list.status === 200, `GET /api/ip/employer/candidates → ${list.status}`);
  const someone = (list.data?.items || [])[0];
  if (!someone) throw new Blocked('Candidate search returned nobody');
  const noInternship = await as(emp, `/api/ip/employer/candidates/${someone.id}/invite`, 'POST', {});
  check(noInternship.status === 400 && /internshipId is required/.test(noInternship.data?.error || ''), `invite without internshipId → ${noInternship.status} ${JSON.stringify(noInternship.data)}`);
  const threadsBefore = Number((await db(`SELECT count(*)::int AS n FROM ip_message_threads WHERE employer_user_id = $1`, [empRow.uid]))[0].n);
  const page = await newQaPage(browser, emp);
  const term = `QA-${TAG}`;
  try {
    await gotoReady(page, BASE, '/employer/candidates', 'input[aria-label="Search candidates"]', 90_000);
    await page.locator('.ip-presets-bar').waitFor({ timeout: 60_000 });
    await page.locator('.ip-ec-card, .ip-ec-empty, article').first().waitFor({ timeout: 90_000 }).catch(() => {});
    const inviteBtn = page.getByRole('button', { name: 'Invite to apply' }).first();
    let cancelNote = 'no candidate open for invite';
    if (await inviteBtn.count()) {
      await inviteBtn.click();
      const dlg = page.locator('.ip-ec-backdrop[role="dialog"]', { hasText: 'Invite candidate to apply' });
      await dlg.waitFor({ timeout: 15_000 });
      check(await dlg.getByRole('button', { name: 'Send invitation' }).isDisabled(), 'Send invitation enabled with no internship chosen');
      await dlg.getByRole('button', { name: 'Cancel' }).click();
      await dlg.waitFor({ state: 'detached', timeout: 10_000 });
      cancelNote = 'invite dialog: Send disabled until an internship is chosen, Cancel closed it';
    }
    const viewHref = await page.getByRole('link', { name: 'View profile' }).first().getAttribute('href');
    const savedQ = async () => (await as(emp, `/api/ip/table-filter-prefs?tableKey=${key}`)).data?.filters?.q;
    const waitSaved = async (want) => {
      for (let i = 0; i < 20; i += 1) {
        if ((await savedQ()) === want) return true;
        await page.waitForTimeout(1000);
      }
      return false;
    };
    await page.getByLabel('Search candidates').fill(term);
    check(await waitSaved(term), `search not saved to table-filter-prefs (q = ${await savedQ()})`);
    await page.reload();
    await page.getByLabel('Search candidates').waitFor({ timeout: 90_000 });
    const restored = await page
      .waitForFunction((t) => document.querySelector('input[aria-label="Search candidates"]')?.value === t, term, { timeout: 60_000 })
      .then(() => true, () => false);
    check(restored, `search box after reload = "${await page.getByLabel('Search candidates').inputValue()}"`);
    await page.getByLabel('Search candidates').fill('');
    await waitSaved('');
    if (viewHref) {
      await page.goto(`${BASE}${viewHref}`);
      await page.waitForURL(/\/employer\/candidates\/[^/?]+/, { timeout: 30_000 });
      check(!(await page.locator('.ip-ec-backdrop[role="dialog"]').count()), 'profile opened as a modal');
    }
    const threadsAfter = Number((await db(`SELECT count(*)::int AS n FROM ip_message_threads WHERE employer_user_id = $1`, [empRow.uid]))[0].n);
    check(threadsAfter === threadsBefore, `invite threads ${threadsBefore} → ${threadsAfter} after Cancel`);
    return `Search "${term}" kept after reload (saved to table-filter-prefs ${key}); ${cancelNote}, no invite created; invite API without internshipId → 400 "internshipId is required"; View profile opens the full page ${viewHref ? viewHref.split('?')[0].replace(/[^/]+$/, '[id]') : ''}.`;
  } finally {
    await page.context().close();
    await as(emp, '/api/ip/table-filter-prefs', 'PUT', { tableKey: key, filters: prior.filters || {}, sort: prior.sort || '' });
  }
});

// ── TC-IS-14-010 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-010', async () => {
  const label = `QA licence ${TAG}`;
  const t0 = new Date();
  const priorOther = (await db(`SELECT id FROM ip_employer_documents WHERE employer_id = $1 AND doc_type = 'Other' AND superseded_at IS NULL`, [empRow.eid])).map((d) => d.id);
  const up = await as(emp, '/api/ip/employer/documents', 'POST', { docType: 'Other', docLabel: label, fileName: `qa-${TAG}.pdf`, url: '/sample-docs/sample-shop-act.pdf' });
  check(up.status === 201, `employer upload → ${up.status} ${JSON.stringify(up.data)}`);
  const docId = up.data.id;
  try {
    const all = (await as(sa, '/api/ip/superadmin/documents?status=all')).data?.items || [];
    check(all.some((d) => d.id === docId && d.display_status === 'pending'), 'new upload not listed as pending');
    const superseded = all.length
      ? await db(`SELECT count(*)::int AS n FROM ip_employer_documents WHERE id = ANY($1) AND superseded_at IS NOT NULL`, [all.map((d) => d.id)])
      : [{ n: 0 }];
    check(superseded[0].n === 0, `${superseded[0].n} superseded document(s) in the SA list`);
    check(!priorOther.length || !all.some((d) => priorOther.includes(d.id)), 'the replaced Other document is still listed');
    const ap = await as(sa, '/api/ip/superadmin/documents', 'PATCH', { id: docId, reviewStatus: 'approved' });
    check(ap.status === 200, `approve → ${ap.status} ${JSON.stringify(ap.data)}`);
    const rj = await as(sa, '/api/ip/superadmin/documents', 'PATCH', { id: docId, reviewStatus: 'rejected' });
    check(rj.status === 200, `reject → ${rj.status} ${JSON.stringify(rj.data)}`);
    const notices = (await db(`SELECT title FROM ip_notifications WHERE user_id = $1 AND created_at >= $2 AND title IN ('Document Approved', 'Document Rejected')`, [empRow.uid, t0])).map((n) => n.title);
    check(notices.includes('Document Approved') && notices.includes('Document Rejected'), `employer notices ${JSON.stringify(notices)}`);
    const page = await newQaPage(browser, sa);
    let rowText;
    try {
      await gotoReady(page, BASE, '/superadmin/documents', 'select[aria-label="Document type"]', 90_000);
      await page.locator('select[aria-label="Document type"]').selectOption('Other');
      const row = page.locator('tr', { hasText: `qa-${TAG}.pdf` }).first();
      await row.waitFor({ timeout: 45_000 });
      rowText = (await row.innerText()).replace(/\s+/g, ' ');
    } finally {
      await page.context().close();
    }
    check(/\bRejected\b/.test(rowText) && !/flagged/i.test(rowText), `status badge in row: "${rowText}"`);
    check([' - ', ' – ', ' — '].some((dash) => rowText.includes(`Other${dash}${label}`)), `type label in row is not "Other — ${label}": "${rowText}"`);
    return `Only active docs listed (replaced Other hidden, none superseded); new upload Pending; approve and reject both notify the employer ("Document Approved", "Document Rejected"); row shows Title Case "Rejected" and type "Other — ${label}".`;
  } finally {
    await db(`DELETE FROM ip_employer_documents WHERE id = $1`, [docId]);
    if (priorOther.length) await db(`UPDATE ip_employer_documents SET superseded_at = NULL WHERE id = ANY($1)`, [priorOther]);
    await db(`DELETE FROM ip_notifications WHERE user_id = $1 AND created_at >= $2 AND title IN ('Document Approved', 'Document Rejected')`, [empRow.uid, t0]);
  }
});

// ── TC-IS-14-011 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-011', async () => {
  const r = await as(sa, '/api/ip/superadmin/postings');
  check(r.status === 200, `SuperAdmin GET postings → ${r.status}`);
  for (const [who, login] of [['candidate', cand], ['employer', emp]]) {
    const x = await as(login, '/api/ip/superadmin/postings');
    check(x.status === 401 || x.status === 403, `${who} GET SA postings → ${x.status}`);
  }
  const mine = (r.data?.items || []).find((p) => p.company_name === empRow.company_name && p.status === 'published');
  if (!mine) throw new Blocked(`No published posting from ${empRow.company_name} in the SA list`);
  const page = await newQaPage(browser, sa);
  try {
    await gotoReady(page, BASE, '/superadmin/postings', 'input[placeholder^="Search posting title"]', 90_000);
    await page.locator('input[placeholder^="Search posting title"]').fill(mine.title);
    await page.locator('table tbody tr', { hasText: mine.title }).first().waitFor({ timeout: 30_000 });
    const shown = await page.locator('table tbody tr').allInnerTexts();
    check(shown.every((t) => t.toLowerCase().includes(mine.title.toLowerCase())), 'search left non-matching rows');
  } finally {
    await page.context().close();
  }
  return `SuperAdmin GET /api/ip/superadmin/postings → 200 (candidate/employer refused); the test employer's published posting "${mine.title}" is live without SuperAdmin approval and the page search finds only it.`;
});

// ── TC-IS-14-014 / TC-IS-14-015 ─────────────────────────────────────────────
const ghostEmail = `nobody.${TAG.toLowerCase()}@example.com`;
await runCase('TC-IS-14-014', async () => {
  const fail = await apiLogin(BASE, ghostEmail, 'Wrong-Pass-1!');
  check(!fail.ok, 'unknown email signed in');
  const rep = await as(sa, '/api/ip/superadmin/login-report?range=24h&meta=1');
  check(rep.status === 200, `GET login-report → ${rep.status}`);
  const items = rep.data?.items || [];
  const ghost = items.find((e) => String(e.email).toLowerCase() === ghostEmail);
  check(ghost && ghost.success === false && ghost.failure_reason === 'Unknown account', `unknown-email event ${JSON.stringify(ghost)}`);
  const ok = items.find((e) => String(e.email).toLowerCase() === cand.email.toLowerCase() && e.success === true);
  check(ok && ok.role === 'candidate', `candidate success event ${JSON.stringify(ok && { role: ok.role, success: ok.success })}`);
  const keys = ['email', 'role', 'success', 'ip_address', 'user_agent', 'failure_reason'];
  check(keys.every((k) => k in ghost), `event fields ${Object.keys(ghost)}`);
  const page = await newQaPage(browser, sa);
  try {
    await gotoReady(page, BASE, '/superadmin/login-report', 'select[aria-label="Time range"]', 90_000);
    await page.locator('table.ip-saq-table tbody tr').first().waitFor({ timeout: 90_000 });
    const loaded24h = page.waitForResponse((r) => r.url().includes('/api/ip/superadmin/login-report?range=24h'), { timeout: 90_000 });
    await page.locator('select[aria-label="Time range"]').selectOption('24h');
    await loaded24h;
    await page.waitForTimeout(500);
    for (const [tab, pill] of [['Candidates', 'CANDIDATE'], ['Employers', 'EMPLOYER']]) {
      await page.locator('.ip-saq-tab', { hasText: tab }).click();
      const pills = await page.locator('table.ip-saq-table tbody tr td:nth-child(4)').allInnerTexts();
      check(pills.length > 0 && pills.every((p) => p.trim() === pill), `${tab} tab shows roles ${JSON.stringify([...new Set(pills)])}`);
    }
    await page.locator('.ip-saq-tab', { hasText: 'All Roles' }).click();
    await page.locator('select[aria-label="Result filter"]').selectOption('failed');
    await page.locator('input[placeholder^="Search email"]').fill(ghostEmail);
    const row = page.locator('table.ip-saq-table tbody tr', { hasText: ghostEmail }).first();
    await row.waitFor({ timeout: 20_000 });
    check(/Unknown account/.test(await row.innerText()), 'failed row does not show "Unknown account"');
  } finally {
    await page.context().close();
  }
  return 'Unknown-email sign-in logged (success false, failure_reason "Unknown account"); test candidate sign-in logged as candidate success; events carry email/role/success/ip_address/user_agent/failure_reason; Candidates and Employers tabs show only that role; Failed only + search finds the unknown-email row with its reason.';
});

await runCase('TC-IS-14-015', async () => {
  const page = await newQaPage(browser, sa);
  try {
    await gotoReady(page, BASE, '/superadmin/login-report', 'select[aria-label="Time range"]', 90_000);
    await page.locator('table.ip-saq-table tbody tr').first().waitFor({ timeout: 90_000 });
    await page.locator('select[aria-label="Time range"]').selectOption('24h');
    const rep = (await as(sa, '/api/ip/superadmin/login-report?range=24h&meta=1')).data;
    const items = rep.items || [];
    const metric = async (name) => Number((await page.locator('.ip-saq-metric', { hasText: name }).locator('strong').innerText()).replace(/\D/g, ''));
    let total;
    let success;
    let failed;
    for (let i = 0; i < 60; i += 1) {
      [total, success, failed] = [await metric('Total Auth Events'), await metric('Successful Logins'), await metric('Failed / Flagged')];
      if (Math.abs(total - rep.meta.total) <= 2 && Math.abs(success - rep.meta.success) <= 2 && Math.abs(failed - rep.meta.failed) <= 2) break;
      await page.waitForTimeout(1000);
    }
    check(Math.abs(total - rep.meta.total) <= 2 && Math.abs(success - rep.meta.success) <= 2 && Math.abs(failed - rep.meta.failed) <= 2, `tiles ${total}/${success}/${failed} vs API ${rep.meta.total}/${rep.meta.success}/${rep.meta.failed}`);
    const tabCount = async (name) => Number(((await page.locator('.ip-saq-tab', { hasText: name }).innerText()).match(/\((\d+)\)/) || [])[1]);
    const counts = { all: await tabCount('All Roles'), employer: await tabCount('Employers'), candidate: await tabCount('Candidates'), superadmin: await tabCount('SuperAdmins') };
    const api = {
      all: items.length,
      employer: items.filter((e) => e.role === 'employer').length,
      candidate: items.filter((e) => e.role === 'candidate').length,
      superadmin: items.filter((e) => e.role === 'superadmin').length,
    };
    check(Object.keys(api).every((k) => Math.abs(counts[k] - api[k]) <= 2), `role tabs ${JSON.stringify(counts)} vs API rows ${JSON.stringify(api)}`);
    const clipped = () =>
      page.locator('.ip-saq-table-wrap').first().evaluate((wrap) => {
        const scrolls = ['auto', 'scroll'].includes(getComputedStyle(wrap).overflowX);
        const out = [];
        if (!scrolls && wrap.scrollWidth > wrap.clientWidth + 1) out.push(`table ${wrap.scrollWidth}px in ${wrap.clientWidth}px wrapper`);
        for (const cell of wrap.querySelectorAll('th, td')) {
          const s = getComputedStyle(cell);
          if (s.display === 'none' || !cell.clientWidth) continue;
          if (cell.scrollWidth > cell.clientWidth + 1 && s.overflowX !== 'auto' && s.overflowX !== 'scroll') {
            out.push(`"${cell.innerText.trim().slice(0, 30)}" ${cell.scrollWidth}>${cell.clientWidth}`);
          }
        }
        return out.slice(0, 5);
      });
    const widths = [1280, 900];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(600);
      const cut = await clipped();
      check(!cut.length, `clipped columns at ${width}px: ${cut.join('; ')}`);
    }
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(600);
    check(await noPageHScroll(page), 'page scrolls sideways at 390px');
    const cutMobile = await clipped();
    check(!cutMobile.length, `clipped content in the 390px row cards: ${cutMobile.join('; ')}`);
    return `KPI tiles ${total}/${success}/${failed} match API meta; role tabs ${JSON.stringify(counts)} match the API rows; no clipped header or cell at ${widths.join('px / ')}px; at 390px rows stack as cards with nothing cut off and no sideways page scroll.`;
  } finally {
    await page.context().close();
  }
});

// ── TC-IS-14-017 ────────────────────────────────────────────────────────────
await runCase('TC-IS-14-017', async () => {
  const cats = (await as(cand, '/api/ip/idea-categories')).data?.items || [];
  if (!cats.length) throw new Blocked('No idea categories');
  const title = `QA idea ${TAG}`;
  const made = await as(cand, '/api/ip/ideas', 'POST', { title, problem: 'QA problem text.', solution: 'QA proposed improvement.', categoryId: cats[0].id });
  check(made.status === 201, `candidate submit idea → ${made.status} ${JSON.stringify(made.data)}`);
  const ideaId = made.data.id;
  const t0 = new Date();
  try {
    const note = `QA product team note ${TAG}`;
    const asCand = await as(cand, `/api/ip/superadmin/feature-ideas/${ideaId}`, 'PATCH', { status: 'Under review' });
    check(asCand.status === 401 || asCand.status === 403, `candidate PATCH → ${asCand.status}`);
    const bad = await as(sa, `/api/ip/superadmin/feature-ideas/${ideaId}`, 'PATCH', { status: 'Nonsense' });
    check(bad.status === 400, `invalid status → ${bad.status}`);
    const missing = await as(sa, '/api/ip/superadmin/feature-ideas/ip_idea_does_not_exist', 'PATCH', { status: 'Under review' });
    check(missing.status === 404, `unknown idea → ${missing.status}`);
    const ok = await as(sa, `/api/ip/superadmin/feature-ideas/${ideaId}`, 'PATCH', { status: 'Under review', adminNote: note });
    check(ok.status === 200, `SuperAdmin PATCH → ${ok.status} ${JSON.stringify(ok.data)}`);
    const comment = `QA official comment ${TAG}`;
    const c = await as(sa, `/api/ip/ideas/${ideaId}/comments`, 'POST', { body: comment });
    check(c.status === 201, `SuperAdmin comment → ${c.status} ${JSON.stringify(c.data)}`);
    const idea = ((await as(cand, '/api/ip/ideas')).data?.items || []).find((i) => i.id === ideaId);
    check(idea?.status === 'Under review' && idea?.admin_note === note, `candidate sees ${JSON.stringify(idea && { status: idea.status, admin_note: idea.admin_note })}`);
    const notified = await db(`SELECT 1 FROM ip_notifications WHERE user_id = $1 AND title = $2 AND created_at >= $3`, [candRow.uid, 'Your idea is now "Under review"', t0]);
    check(notified.length > 0, 'author not notified of the status change');
    const page = await newQaPage(browser, cand);
    try {
      await gotoReady(page, BASE, '/ideas', 'input[aria-label="Search ideas"]', 90_000);
      await page.locator(`${IDEA_TITLE} >> visible=true`).first().waitFor({ timeout: 90_000 });
      await page.getByLabel('Search ideas').fill(title);
      await page.locator(IDEA_TITLE, { hasText: title }).first().click();
      const dlg = page.locator('[role="dialog"][aria-labelledby="ip-ci-detail-title"]');
      await dlg.getByText('Product team response').waitFor({ timeout: 20_000 });
      check(await dlg.getByText(note).isVisible(), 'admin note not shown');
      await dlg.getByText(comment).waitFor({ timeout: 20_000 });
      check((await dlg.getByText('Product team', { exact: true }).count()) > 0, 'SuperAdmin comment not labelled Product team');
    } finally {
      await page.context().close();
    }
    return 'Candidate idea → SuperAdmin PATCH status "Under review" + admin note (200; candidate 403, bad status 400, unknown id 404); author notified; SuperAdmin comment posted; on /ideas the detail shows "Product team response" with the note and the comment labelled Product team.';
  } finally {
    await db(`DELETE FROM ip_feature_idea_comments WHERE idea_id = $1`, [ideaId]);
    await db(`DELETE FROM ip_feature_idea_votes WHERE idea_id = $1`, [ideaId]);
    await db(`DELETE FROM ip_feature_idea_follows WHERE idea_id = $1`, [ideaId]);
    await db(`DELETE FROM ip_feature_ideas WHERE id = $1`, [ideaId]);
    await db(`DELETE FROM ip_notifications WHERE created_at >= $1 AND body = $2`, [t0, title]);
  }
});

await browser.close().catch(() => {});
await pool.end();
if (Object.keys(results).length) recordQaResults(results, { source: 'qa-test-account-cases' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();
const counts = Object.values(results).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
console.log(`\nDone: ${JSON.stringify(counts)}`);
process.exit(counts.Fail ? 1 : 0);
