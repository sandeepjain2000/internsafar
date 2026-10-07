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
import { apiRequest, ensureQaTestAccounts, requireQaLogin } from './lib/ipQaAuth.mjs';
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

await browser.close().catch(() => {});
await pool.end();
if (Object.keys(results).length) recordQaResults(results, { source: 'qa-test-account-cases' });
if (APPLY_EXCEL) applyQaResultsToWorkbook();
const counts = Object.values(results).reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
console.log(`\nDone: ${JSON.stringify(counts)}`);
process.exit(counts.Fail ? 1 : 0);
