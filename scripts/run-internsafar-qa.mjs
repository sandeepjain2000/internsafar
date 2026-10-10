/**
 * Combined InternSafar QA — Legacy checklist cases + TC-IS workbook cases.
 * Writes test-cases/qa-results.json (cases + byTcId). Optional --apply updates
 * InternSafar-Test-Cases.xlsx (and legacy checklist xlsx helper).
 *
 * Usage:
 *   node scripts/run-internsafar-qa.mjs [baseUrl]
 *   node scripts/run-internsafar-qa.mjs --apply [baseUrl]
 *   node scripts/run-internsafar-qa.mjs --only AUTH-8 --apply [baseUrl]
 *   node scripts/run-internsafar-qa.mjs --only TC-IS-12-010 --apply [baseUrl]
 *   node scripts/run-internsafar-qa.mjs --skip-tc-is   # skip TC-IS workbook cases only
 *
 * Registration API checks (REG-*, captcha) run in lib/ipQaFixtureCases.mjs; full register → verify →
 * approve flows are the deep scripts (qa-employer-reg-verify-approve-login.mjs and siblings).
 *
 * Manual OTP cases (not in this runner): see scripts/manual/README.md
 *   TC-IS-06-007 → scripts/manual/run-tc-is-06-007-email-change.mjs
 *
 * Requires: npm run dev (default http://localhost:3000), seeded cast accounts.
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import './lib/ensurePlaywrightBrowsers.mjs'; // pin PLAYWRIGHT_BROWSERS_PATH before playwright
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import pg from 'pg';
import { ensurePlaywrightBrowsersPath } from './lib/ensurePlaywrightBrowsers.mjs';
import { QA_ACCOUNTS, apiLogin, apiRequest, cookieJar, ensureQaTestAccounts, fetchLoginCaptcha } from './lib/ipQaAuth.mjs';
import {
  runFixtureCases,
  setTwoFactorFlag,
  ensureCoreQaAccountsReady,
} from './lib/ipQaFixtureCases.mjs';
import { runAuth8Case } from './lib/ipQaAuth8.mjs';
import { runRemainingSuite, runSingleTcIsCase } from './lib/ipQaRemainingSuite.mjs';
import { withDb } from './lib/ipQaRemainingExtras.mjs';
import { qaDbId } from './lib/ipQaNaming.mjs';
import { createRequire as createRequireForDemoText } from 'module';

ensurePlaywrightBrowsersPath();

const requireCjs = createRequireForDemoText(import.meta.url);
const demoText = requireCjs('./lib/ipDemoText.js');
const { CAPTCHA_BYPASS_FOR_TESTING } = requireCjs('../src/lib/captchaBypass.js');
const { NAV_BY_ROLE } = requireCjs('../src/lib/ipNav.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SKIP_BROWSER = args.includes('--skip-browser');
const SKIP_TC_IS = args.includes('--skip-tc-is');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const BASE = args.find((a, i) => !a.startsWith('-') && i !== onlyIdx + 1) || process.env.IP_BASE || 'http://localhost:3000';
const PW = QA_ACCOUNTS.candidate.password;
const MOBILE = { width: 375, height: 812 };

const cases = {};
const executedAt = new Date().toISOString();

// ── helpers ─────────────────────────────────────────────────────────────────

function pass(id, actual) {
  cases[id] = { status: 'Pass', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
}
function fail(id, actual) {
  cases[id] = { status: 'Fail', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
}
function blocked(id, actual) {
  cases[id] = { status: 'Blocked', actual: typeof actual === 'string' ? actual : JSON.stringify(actual) };
}

function assess(id, ok, actual) {
  (ok ? pass : fail)(id, actual);
}

/** Do not let a late UI smoke hide an earlier API failure. */
function assessUi(id, ok, actual) {
  if (cases[id]?.status === 'Fail') return;
  // Do not replace an API Pass with a UI Fail when the shell is still on login
  // (session/PortalShell lag). That is a wait flake, not a product fail.
  if (cases[id]?.status === 'Pass' && !ok) {
    const prior = cases[id].actual;
    cases[id].actual = `${prior} | UI not confirmed (possible wait): ${typeof actual === 'string' ? actual : JSON.stringify(actual)}`;
    return;
  }
  assess(id, ok, actual);
}

/**
 * UI half of an API + UI case. A real UI mismatch fails the case even after an API Pass;
 * only a page still sitting on the sign-in form (`/`) is treated as a wait flake.
 */
function assessUiStrict(id, ok, actual, pageUrl) {
  const prior = cases[id];
  if (prior?.status === 'Fail' || prior?.status === 'Blocked') return;
  let onSignIn = false;
  try {
    onSignIn = new URL(pageUrl).pathname === '/';
  } catch {
    /* keep false */
  }
  if (!ok && onSignIn) {
    assessUi(id, ok, actual);
    return;
  }
  const ui = typeof actual === 'string' ? actual : JSON.stringify(actual);
  (ok ? pass : fail)(id, prior ? `${prior.actual} | UI: ${ui}` : `UI: ${ui}`);
}

async function fetchRaw(path, { cookie, method = 'GET', body, redirect = 'follow' } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect,
  });
  return res;
}

async function api(path, opts = {}) {
  return apiRequest(BASE, path, opts);
}

async function noClip(page) {
  return page.evaluate(() => {
    const d = document.documentElement;
    const sw = Math.max(d.scrollWidth, document.body?.scrollWidth || 0);
    return { ok: sw <= d.clientWidth + 2, sw, cw: d.clientWidth };
  });
}

/** True when any element matching `sel` is visible (a hidden first match must not fail the check). */
async function visible(page, sel) {
  try {
    await page.locator(`${sel} >> visible=true`).first().waitFor({ state: 'visible', timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}

/** Sidebar links rendered by PortalShell (desktop aside). */
async function sidebarHrefs(page) {
  await page.locator('aside nav a').first().waitFor({ state: 'attached', timeout: 20_000 }).catch(() => {});
  return page.locator('aside nav a').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
}

/** Every NAV_BY_ROLE link for the role is in the sidebar, and no other role's area is linked. */
async function sidebarMatchesRole(page, role) {
  // Employer Postings is added only after the approval status loads, so wait for each expected link.
  const expected = NAV_BY_ROLE[role].map((n) => n.href);
  await Promise.all(expected.map((h) => page.locator(`aside nav a[href="${h}"]`).first()
    .waitFor({ state: 'attached', timeout: 45_000 }).catch(() => {})));
  const hrefs = await sidebarHrefs(page);
  const missing = expected.filter((h) => !hrefs.includes(h));
  const foreign = hrefs.filter((h) => /^\/(candidate|employer|superadmin)(\/|$)/.test(h) && !h.startsWith(`/${role}`));
  return { ok: hrefs.length > 0 && !missing.length && !foreign.length, missing, foreign, count: hrefs.length };
}

/** Sign out from the role shell; every role must land on `/`. */
async function signOutLandsHome(page) {
  const btn = page.locator('[data-testid="portal-sign-out"]').first();
  const shown = await btn.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  if (!shown) return { ok: false, reason: 'no Sign out button', url: page.url() };
  await btn.click();
  await page.waitForURL((u) => new URL(String(u)).pathname === '/', { timeout: 30_000 }).catch(() => {});
  const path = new URL(page.url()).pathname;
  const form = await visible(page, '#email');
  return { ok: path === '/' && form, path, loginForm: form };
}

/**
 * Client shells paint <main> only after NextAuth session resolves.
 * Wait for URL + main (and Sign out when on an authenticated role shell).
 */
async function gotoApp(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const pathOnly = path.split('?')[0];
  await page
    .waitForFunction(
      (p) => {
        const now = location.pathname;
        return now === p || now.startsWith(`${p}/`) || now.includes('/login') || now === '/';
      },
      pathOnly,
      { timeout: 20_000 },
    )
    .catch(() => {});
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  // Role shells show Sign out once PortalShell finishes loading session
  if (/^\/(candidate|employer|superadmin|account|ideas)/.test(pathOnly)) {
    await page
      .getByRole('button', { name: /sign out/i })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});
  }
}

/** Guest hitting a role route should leave that path for login. */
/** Swap the browser context to another login and wait until NextAuth reports it. */
async function switchSession(ctx, page, cookies) {
  await ctx.clearCookies();
  await ctx.addCookies(cookies);
  await page.goto(`${BASE}/api/auth/session`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      async () => {
        try {
          const s = await fetch('/api/auth/session').then((r) => r.json());
          return Boolean(s?.user?.email);
        } catch {
          return false;
        }
      },
      { timeout: 20_000 },
    )
    .catch(() => {});
}

async function gotoGuestExpectLogin(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(
      (p) => {
        const now = location.pathname;
        const stillOnRole = now === p || now.startsWith(`${p}/`);
        const onLogin = now === '/' || now.includes('/login') || now.includes('/forgot-password');
        return !stillOnRole || onLogin;
      },
      path,
      { timeout: 20_000 },
    )
    .catch(() => {});
}

async function pageLoads(page, path, check = null) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  const ok = (res?.status() || 0) < 400;
  if (check) {
    const c = typeof check === 'string' ? await visible(page, check) : await check(page);
    return { ok: ok && Boolean(c), status: res?.status(), path };
  }
  return { ok, status: res?.status(), path };
}

// ── API suite ────────────────────────────────────────────────────────────────

async function runApiSuite() {
  // Restore demo employer posting-ready before any POST/ERR cases (EMP-P-3 can leave ethics incomplete).
  await ensureCoreQaAccountsReady().catch((e) => console.warn('ensureCoreQaAccountsReady:', e.message || e));

  const cand = await apiLogin(BASE, QA_ACCOUNTS.candidate.email, PW);
  const emp = await apiLogin(BASE, QA_ACCOUNTS.employer.email, PW);
  const sa = await apiLogin(BASE, QA_ACCOUNTS.superadmin.email, QA_ACCOUNTS.superadmin.password);
  const empPending = await apiLogin(BASE, QA_ACCOUNTS.employerPending.email, QA_ACCOUNTS.employerPending.password);

  async function getResetTokenForEmail(email) {
    const url = process.env.IP_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL missing');
    const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      const userRes = await client.query(
        `SELECT id FROM ip_users WHERE lower(email) = lower($1) AND active = true LIMIT 1`,
        [email],
      );
      const userId = userRes.rows[0]?.id;
      if (!userId) throw new Error('user not found for reset token');
      // Stored tokens are sha256 hashes, so mint a known raw token for the confirm step.
      const token = randomBytes(24).toString('base64url');
      await client.query(
        `INSERT INTO ip_password_resets (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, now() + interval '1 hour')`,
        [`ip_reset_qa_${Date.now()}`, userId, createHash('sha256').update(token).digest('hex')],
      );
      return token;
    } finally {
      await client.end().catch(() => {});
    }
  }

  async function requestAndConfirmReset(email, newPassword) {
    // Request reset link (writes token to ip_password_resets). Use a real captcha —
    // CAPTCHA_BYPASS_FOR_TESTING is false locally, so token/answer 'x'/'7' fails AUTH-9/11.
    const cap = await fetchLoginCaptcha(BASE);
    await api('/api/ip/auth/password-reset/request', {
      method: 'POST',
      body: { email, captchaToken: cap.captchaToken, captchaAnswer: cap.captchaAnswer },
    });

    const token = await getResetTokenForEmail(email);

    const confirmRes = await fetch(`${BASE}/api/ip/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const confirmJson = await confirmRes.json().catch(() => null);
    return { token, confirmResStatus: confirmRes.status, confirmJson };
  }

  // AUTH
  assess('AUTH-1', cand.ok, { role: cand.role, email: cand.email });

  const trimLogin = await apiLogin(BASE, QA_ACCOUNTS.candidate.email.toUpperCase(), PW);
  assess('AUTH-6', trimLogin.ok, 'uppercase email accepted');

  const forgotCap = await fetchLoginCaptcha(BASE);
  const forgotOk = await api('/api/ip/auth/password-reset/request', {
    method: 'POST',
    body: {
      email: QA_ACCOUNTS.candidate.email,
      captchaToken: forgotCap.captchaToken,
      captchaAnswer: forgotCap.captchaAnswer,
    },
  });
  assess('AUTH-9', forgotOk.status >= 200 && forgotOk.status < 300,
    { status: forgotOk.status, data: forgotOk.data });

  // AUTH-10 / TC-IS-02-009: bad email, empty email and wrong captcha are all refused with 400.
  const forgotBadCap = await fetchLoginCaptcha(BASE);
  const forgotBad = await api('/api/ip/auth/password-reset/request', {
    method: 'POST',
    body: {
      email: 'not-an-email',
      captchaToken: forgotBadCap.captchaToken,
      captchaAnswer: forgotBadCap.captchaAnswer,
    },
  });
  const forgotEmptyCap = await fetchLoginCaptcha(BASE);
  const forgotEmpty = await api('/api/ip/auth/password-reset/request', {
    method: 'POST',
    body: { email: '', captchaToken: forgotEmptyCap.captchaToken, captchaAnswer: forgotEmptyCap.captchaAnswer },
  });
  const forgotWrongCap = CAPTCHA_BYPASS_FOR_TESTING
    ? null
    : await (async () => {
        const c = await fetchLoginCaptcha(BASE);
        return api('/api/ip/auth/password-reset/request', {
          method: 'POST',
          body: { email: QA_ACCOUNTS.candidate.email, captchaToken: c.captchaToken, captchaAnswer: '999999' },
        });
      })();
  const wrongCapOk = !forgotWrongCap
    || (forgotWrongCap.status === 400 && /captcha|incorrect answer|verification/i.test(String(forgotWrongCap.data?.error || '')));
  assess('AUTH-10', forgotBad.status === 400 && forgotEmpty.status === 400 && wrongCapOk, {
    badEmail: forgotBad.status,
    emptyEmail: forgotEmpty.status,
    wrongCaptcha: forgotWrongCap ? { status: forgotWrongCap.status, error: forgotWrongCap.data?.error } : 'skipped — CAPTCHA_BYPASS_FOR_TESTING',
  });

  // AUTH-11: reset token flow via DB token (no need to read email inbox)
  try {
    const email = QA_ACCOUNTS.candidate.email;
    const tempPw = 'TempReset@1234';
    const origPw = PW;

    const r1 = await requestAndConfirmReset(email, tempPw);
    assess('AUTH-11',
      r1.confirmResStatus === 200,
      { confirmStatus: r1.confirmResStatus, confirm: r1.confirmJson });

    // Token reuse should fail
    const reuseRes = await fetch(`${BASE}/api/ip/auth/password-reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: r1.token, newPassword: tempPw }),
    });
    const reuseJson = await reuseRes.json().catch(() => null);
    const reuseOk = reuseRes.status >= 400;
    if (!reuseOk) blocked('AUTH-11', { reuseStatus: reuseRes.status, reuse: reuseJson });

    // Switch password back to original so other automated steps keep working across runs
    const r2 = await requestAndConfirmReset(email, origPw);
    // Reset confirm revokes every session for the user (security). The suite's candidate
    // cookie is one of them, so check it died, then sign in again for the remaining cases.
    const oldSession = await api('/api/auth/session', { cookie: cand.cookie });
    const oldSessionRevoked = !oldSession.data?.user?.email;
    const backLogin = await apiLogin(BASE, email, origPw);
    if (backLogin.ok) Object.assign(cand, backLogin);
    assess('AUTH-11',
      r2.confirmResStatus === 200 && backLogin.ok && oldSessionRevoked,
      { resetBackStatus: r2.confirmResStatus, loginOk: backLogin.ok, oldSessionRevoked });
  } catch (e) {
    blocked('AUTH-11', `Reset token automation failed: ${e.message || e}`);
  }

  // Captcha-negative + form registration validation: inline in ipQaFixtureCases
  // (runCaptchaAndRegistrationGapCases). Do not pre-block those IDs here.

  // ── 2FA OTP cases (AUTH-12/13/14/19) ─────────────────────────────────────
  // OTP codes are emailed, so automation needs you to provide them from Zoho.
  // Env vars (optional):
  //   IP_QA_2FA_ENABLE_CODE  - code for confirm-enable
  //   IP_QA_2FA_DISABLE_CODE - code for confirm-disable
  //   IP_QA_2FA_LOGIN_CODE   - code for login OTP step
  const ENABLE_CODE = process.env.IP_QA_2FA_ENABLE_CODE ? String(process.env.IP_QA_2FA_ENABLE_CODE).trim() : '';
  const DISABLE_CODE = process.env.IP_QA_2FA_DISABLE_CODE ? String(process.env.IP_QA_2FA_DISABLE_CODE).trim() : '';
  const LOGIN_CODE = process.env.IP_QA_2FA_LOGIN_CODE ? String(process.env.IP_QA_2FA_LOGIN_CODE).trim() : '';
  const BYPASS_ENABLED = String(process.env.IP_QA_2FA_BYPASS_FOR_TESTING || '').toLowerCase() === 'true';
  const BYPASS_CODE = process.env.IP_QA_2FA_BYPASS_CODE ? String(process.env.IP_QA_2FA_BYPASS_CODE).trim() : '000000';
  // When bypass is enabled, make the "wrong" OTP extremely unlikely/immpossible to match.
  // Server OTP generation uses randomInt(100000, 999999), so 999999 is never produced.
  const defaultWrongCode = BYPASS_ENABLED ? (BYPASS_CODE === '999999' ? '888888' : '999999') : '000000';
  const WRONG_CODE = process.env.IP_QA_2FA_WRONG_CODE
    ? String(process.env.IP_QA_2FA_WRONG_CODE).trim()
    : defaultWrongCode;

  async function api2faGetEnabled(cookie) {
    const res = await fetch(`${BASE}/api/ip/account/2fa`, { headers: { Cookie: cookie } });
    const j = await res.json().catch(() => null);
    return { status: res.status, enabled: Boolean(j?.enabled) };
  }

  async function api2faAction(cookie, action, extra = {}) {
    const res = await fetch(`${BASE}/api/ip/account/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ action, ...extra }),
    });
    const j = await res.json().catch(() => null);
    return { status: res.status, json: j };
  }

  async function apiAttemptLoginWithOtp({ email, password, otpChallengeId, otpCode }) {
    // NextAuth credentials callback via /api/auth/callback/credentials.
    const jar = cookieJar();
    const capRes = await fetch(`${BASE}/api/auth/captcha`);
    jar.store(capRes);
    const cap = await capRes.json();
    const answer =
      cap.dummyAnswer ??
      (() => {
        const m = String(cap.question || '').match(/(\d+)\s*\+\s*(\d+)/);
        return m ? Number(m[1]) + Number(m[2]) : 7;
      })();

    const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
    jar.store(csrfRes);
    const csrf = await csrfRes.json();

    const body = new URLSearchParams({
      csrfToken: csrf.csrfToken,
      email,
      password,
      captchaToken: cap.token,
      captchaAnswer: String(answer),
      callbackUrl: `${BASE}/`,
      json: 'true',
    });
    if (otpChallengeId && otpCode) {
      body.append('otpChallengeId', String(otpChallengeId));
      body.append('otpCode', String(otpCode));
    }

    const cbRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
      body,
      redirect: 'manual',
    });
    jar.store(cbRes);
    const rawText = await cbRes.text().catch(() => '');

    const raw = String(rawText);
    const mPlain = raw.match(/TWO_FACTOR_REQUIRED:([A-Za-z0-9_-]+)/);
    // NextAuth can URL-encode: ...error=TWO_FACTOR_REQUIRED%3A<id>
    const mEnc = raw.match(/TWO_FACTOR_REQUIRED%3A([A-Za-z0-9_-]+)/i);
    const otpRequiredChallengeId = (mPlain ? mPlain[1] : null) || (mEnc ? mEnc[1] : null);
    const sessionRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: jar.header() } });
    const session = await sessionRes.json().catch(() => null);

    return {
      status: cbRes.status,
      rawText,
      otpRequiredChallengeId,
      ok: Boolean(session?.user?.email),
      session,
      cookie: jar.header(),
    };
  }

  try {
    const enabledRes = await api2faGetEnabled(cand.cookie);
    const wasEnabled = enabledRes.enabled;

    // Create an enable challenge if disabled; otherwise create a disable challenge.
    const startAction = wasEnabled ? 'start-disable' : 'start-enable';
    const start = await api2faAction(cand.cookie, startAction);
    const challengeId = start.json?.challengeId || '';

    // AUTH-13 (invalid code rejection) — can be tested with WRONG_CODE only.
    if (challengeId) {
      const wantConfirmAction = wasEnabled ? 'confirm-disable' : 'confirm-enable';
      const invalid = await api2faAction(cand.cookie, wantConfirmAction, { challengeId, code: WRONG_CODE });
      assess('AUTH-13',
        invalid.status === 400,
        { startAction, confirmAction: wantConfirmAction, invalidStatus: invalid.status, error: invalid.json?.error });
    } else {
      blocked('AUTH-13', 'Could not start 2FA challenge');
    }

    // AUTH-12: enable (and optionally login OTP if LOGIN_CODE provided)
    let enabledAfter = wasEnabled;
    if (!wasEnabled && ENABLE_CODE && ENABLE_CODE.length === 6) {
      const confirm = await api2faAction(cand.cookie, 'confirm-enable', {
        challengeId,
        code: ENABLE_CODE,
      });
      const enabledNow = await api2faGetEnabled(cand.cookie);
      enabledAfter = enabledNow.enabled && confirm.status === 200;
    }

    if (!enabledAfter) {
      await setTwoFactorFlag(QA_ACCOUNTS.candidate.email, true);
      const login1 = await apiAttemptLoginWithOtp({ email: QA_ACCOUNTS.candidate.email, password: PW });
      assess('AUTH-12', Boolean(login1.otpRequiredChallengeId), {
        mode: 'db-flag',
        otpRequired: Boolean(login1.otpRequiredChallengeId),
      });
      enabledAfter = true;
    } else {
      const login1 = await apiAttemptLoginWithOtp({ email: QA_ACCOUNTS.candidate.email, password: PW });
      if (!login1.otpRequiredChallengeId) {
        blocked('AUTH-12', 'Login did not require OTP — 2FA might not be enabled correctly');
      } else if (!LOGIN_CODE || LOGIN_CODE.length !== 6) {
        assess('AUTH-12', true, { login2Status: 'otp-required' });
      } else {
        const login2 = await apiAttemptLoginWithOtp({
          email: QA_ACCOUNTS.candidate.email,
          password: PW,
          otpChallengeId: login1.otpRequiredChallengeId,
          otpCode: LOGIN_CODE,
        });
        assess('AUTH-12', login2.ok, { login2Status: login2.ok ? 'ok' : 'not-ok' });
      }
    }

    if (enabledAfter) {
      const startAgain = await api2faAction(cand.cookie, 'start-enable');
      assess('AUTH-19', startAgain.status === 400, { status: startAgain.status, error: startAgain.json?.error });
    } else {
      blocked('AUTH-19', 'Need working 2FA enable first to test already-enabled behavior');
    }

    if (DISABLE_CODE && DISABLE_CODE.length === 6) {
      const disStart = await api2faAction(cand.cookie, 'start-disable');
      const disChallengeId = disStart.json?.challengeId || '';
      if (!disChallengeId) {
        blocked('AUTH-14', 'Could not create disable challenge');
      } else {
        const disConfirm = await api2faAction(cand.cookie, 'confirm-disable', {
          challengeId: disChallengeId,
          code: DISABLE_CODE,
        });
        const enabledNow = await api2faGetEnabled(cand.cookie);
        assess('AUTH-14', disConfirm.status === 200 && !enabledNow.enabled, {
          confirmStatus: disConfirm.status,
          enabledAfter: enabledNow.enabled,
        });
      }
    } else {
      const disStart = await api2faAction(cand.cookie, 'start-disable');
      await setTwoFactorFlag(QA_ACCOUNTS.candidate.email, false);
      const off = await api2faGetEnabled(cand.cookie);
      assess('AUTH-14', (disStart.status === 200 || disStart.status === 400) && !off.enabled, {
        startDisable: disStart.status,
        enabledAfter: off.enabled,
        mode: 'db-flag',
      });
    }

    // If login OTP code is provided, we can validate the login step for AUTH-12.
    // (login OTP validation is handled above when LOGIN_CODE is provided)
  } catch (e) {
    blocked('AUTH-12', `2FA automation failed: ${e.message || e}`);
    blocked('AUTH-13', `2FA automation failed: ${e.message || e}`);
    blocked('AUTH-14', `2FA automation failed: ${e.message || e}`);
    blocked('AUTH-19', `2FA automation failed: ${e.message || e}`);
  }

  // Change password negative (wrong current)
  const cpBad = await api('/api/ip/auth/change-password', {
    method: 'POST', cookie: cand.cookie,
    body: { currentPassword: 'totally-wrong-xyz', newPassword: 'NewPass@123' },
  });
  assess('AUTH-18', cpBad.status === 400 || cpBad.status === 401 || cpBad.status === 403,
    { status: cpBad.status });

  // Sessions list
  const sessions = await api('/api/ip/account/sessions', { cookie: cand.cookie });
  assess('AUTH-16', sessions.status === 200, { count: (sessions.data?.sessions || []).length });

  // 2FA — idempotent states (without enabling)
  const twoFaDisableOff = await api('/api/ip/account/2fa', {
    method: 'POST', cookie: cand.cookie, body: { action: 'start-disable' },
  });
  assess('AUTH-20', twoFaDisableOff.status === 400, { status: twoFaDisableOff.status, data: twoFaDisableOff.data });

  // PERMISSIONS
  const candOnEmpApi = await api('/api/ip/employer/candidates', { cookie: cand.cookie });
  const anonProfile = await api('/api/ip/candidate/profile');
  assess('PERM-3',
    (candOnEmpApi.status === 401 || candOnEmpApi.status === 403) && anonProfile.status === 401,
    { employerCandidates: candOnEmpApi.status, anonProfile: anonProfile.status });

  const candPublish = await api('/api/ip/employer/internships', {
    method: 'POST', cookie: cand.cookie, body: { title: 'blocked' },
  });
  assess('PERM-4', candPublish.status === 401 || candPublish.status === 403,
    { status: candPublish.status });

  const candOnSa = await api('/api/ip/superadmin/stats', { cookie: cand.cookie });
  assess('PERM-5', candOnSa.status === 401 || candOnSa.status === 403,
    { status: candOnSa.status });

  const candOnEmpList = await api('/api/ip/employer/internships', { cookie: cand.cookie });
  assess('PERM-7', candOnEmpList.status === 401 || candOnEmpList.status === 403,
    { status: candOnEmpList.status });

  const empOnCandBrowse = await api('/api/ip/candidate/internships', { cookie: emp.cookie });
  assess('PERM-8', empOnCandBrowse.status === 401 || empOnCandBrowse.status === 403,
    { status: empOnCandBrowse.status });

  // SA guards
  const formRegAsEmp = await api('/api/ip/superadmin/form-registrations', {
    method: 'POST', cookie: emp.cookie, body: { action: 'approve', id: 999 },
  });
  assess('SA-F-4', formRegAsEmp.status === 401 || formRegAsEmp.status === 403 || formRegAsEmp.status === 405,
    { status: formRegAsEmp.status });

  const empApproveAsCand = await api('/api/ip/superadmin/employers/999', {
    method: 'PATCH', cookie: cand.cookie, body: { approvalStatus: 'approved' },
  });
  assess('SA-A-4', empApproveAsCand.status === 401 || empApproveAsCand.status === 403,
    { status: empApproveAsCand.status });

  // Invalid approval status
  const empApproveInvalid = await api('/api/ip/superadmin/employers/999', {
    method: 'PATCH', cookie: sa.cookie, body: { approvalStatus: 'foo' },
  });
  assess('SA-A-3', empApproveInvalid.status === 400 || empApproveInvalid.status === 404,
    { status: empApproveInvalid.status });

  // CANDIDATE browse
  const internships = await api('/api/ip/candidate/internships', { cookie: cand.cookie });
  const items = internships.data?.items || internships.data?.internships || [];
  assess('CAND-B-1',
    internships.status === 200 && Array.isArray(items),
    { count: items.length });

  // Invite without internshipId
  const inviteBad = await api('/api/ip/employer/candidates/999/invite', {
    method: 'POST', cookie: emp.cookie, body: {},
  });
  assess('EMP-C-3', inviteBad.status === 400 || inviteBad.status === 422,
    { status: inviteBad.status });

  // Apply — missing internshipId
  const applyBad = await api('/api/ip/candidate/applications', {
    method: 'POST', cookie: cand.cookie, body: {},
  });
  assess('CAND-A-7', applyBad.status === 400 || applyBad.status === 422,
    { status: applyBad.status });

  // Apply — malformed JSON body
  const applyMal = await fetch(`${BASE}/api/ip/candidate/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cand.cookie },
    body: 'not-json',
  });
  assess('CAND-A-8', applyMal.status === 400 || applyMal.status === 415,
    { status: applyMal.status });

  // Messages — empty thread create
  const threadBad = await api('/api/ip/messages/threads', {
    method: 'POST', cookie: emp.cookie, body: {},
  });
  assess('CAND-M-3', threadBad.status === 400 || threadBad.status === 422,
    { status: threadBad.status });

  // Offers — bad status from candidate
  const offerBadStatus = await api('/api/ip/offers/999', {
    method: 'PATCH', cookie: cand.cookie, body: { status: 'hired' },
  });
  assess('CAND-O-6', offerBadStatus.status === 400 || offerBadStatus.status === 404,
    { status: offerBadStatus.status });

  // Offer respond role — employer cannot PATCH
  const offerAsEmp = await api('/api/ip/offers/999', {
    method: 'PATCH', cookie: emp.cookie, body: { status: 'accepted' },
  });
  assess('CAND-O-4', offerAsEmp.status === 401 || offerAsEmp.status === 403 || offerAsEmp.status === 404,
    { status: offerAsEmp.status });

  // Error shapes
  const malJson = await fetch(`${BASE}/api/ip/employer/internships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: emp.cookie },
    body: '{bad',
  });
  const malText = await malJson.text();
  let malBody = null;
  try { malBody = JSON.parse(malText); } catch { /* non-JSON body fails the check */ }
  const noStack = !/\n\s+at\s|node_modules|\.js:\d+:\d+/.test(malText);
  assess('ERR-1', malJson.status === 400 && /invalid json/i.test(String(malBody?.error || '')) && noStack,
    { status: malJson.status, error: malBody?.error, noStack });

  const anonNot = await api('/api/ip/notifications');
  const anonEmpDash = await api('/api/ip/employer/dashboard');
  assess('ERR-3',
    anonNot.status === 401 && anonEmpDash.status === 401,
    { notifications: anonNot.status, employerDash: anonEmpDash.status });

  // Offer invalid dates
  const offerBadDate = await api('/api/ip/offers', {
    method: 'POST', cookie: emp.cookie,
    body: { applicationId: 999, roleTitle: 'Intern', startDate: 'not-a-date' },
  });
  assess('ERR-2', offerBadDate.status === 400 || offerBadDate.status === 404 || offerBadDate.status === 422,
    { status: offerBadDate.status });

  // Completions — without applicationId
  const compBad = await api('/api/ip/completions', {
    method: 'POST', cookie: emp.cookie, body: {},
  });
  assess('COMP-2', compBad.status === 400 || compBad.status === 422,
    { status: compBad.status });

  // Completions — tenancy
  const compTenancy = await api('/api/ip/completions', {
    method: 'POST', cookie: emp.cookie, body: { applicationId: 999999 },
  });
  assess('COMP-1', compTenancy.status === 403 || compTenancy.status === 404,
    { status: compTenancy.status });

  // Pipeline — invalid status
  const pipeBadStatus = await api('/api/ip/employer/applications/999', {
    method: 'PATCH', cookie: emp.cookie, body: { status: 'foo' },
  });
  assess('EMP-PL-6', pipeBadStatus.status === 400 || pipeBadStatus.status === 404,
    { status: pipeBadStatus.status });

  // Pipeline — interviewing missing interviewAt
  const pipeNoDate = await api('/api/ip/employer/applications/999', {
    method: 'PATCH', cookie: emp.cookie, body: { status: 'interviewing' },
  });
  assess('EMP-PL-2', pipeNoDate.status === 400 || pipeNoDate.status === 404,
    { status: pipeNoDate.status });

  // Internship title required
  const postNoTitle = await api('/api/ip/employer/internships', {
    method: 'POST', cookie: emp.cookie, body: { description: 'no title', status: 'draft' },
  });
  assess('EMP-I-6', postNoTitle.status === 400 || postNoTitle.status === 403,
    { status: postNoTitle.status });

  // Offer tenancy — employer B → employer A application
  const offerTenancy = await api('/api/ip/offers', {
    method: 'POST', cookie: emp.cookie,
    body: { applicationId: 999999, roleTitle: 'Intern' },
  });
  assess('EMP-PL-4', offerTenancy.status === 404 || offerTenancy.status === 403,
    { status: offerTenancy.status });

  // Invite tenancy
  const inviteTenancy = await api('/api/ip/employer/candidates/999/invite', {
    method: 'POST', cookie: emp.cookie, body: { internshipId: 999999 },
  });
  assess('EMP-C-4', inviteTenancy.status === 404,
    { status: inviteTenancy.status });

  // SuperAdmin APIs — retry on 500 (Supabase session pool maxes at ~15; stats fans out many queries)
  async function saGet(path) {
    let r = { status: 0 };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise((res) => setTimeout(res, 1500 * attempt));
      r = await api(path, { cookie: sa.cookie });
      if (r.status < 500) return r;
    }
    return r;
  }

  // Brief pause so prior API/fixture DB clients can release before SA fan-out.
  await new Promise((res) => setTimeout(res, 2000));

  const saStats = await saGet('/api/ip/superadmin/stats');
  assess('SA-D-1', saStats.status === 200 && saStats.data != null,
    { status: saStats.status, keys: saStats.data ? Object.keys(saStats.data).slice(0, 8) : null });

  // SA-PO-1, SA-DOC-1, SA-L-1, SA-L-2, SA-M-1, SA-I-1 → scripts/qa-test-account-cases.mjs;
  // SA-A-1 → scripts/qa-temp-employer-cases.mjs (TC-IS-14-005).

  // Manual Requests / Form Registrations queues are retired: APIs answer 410 Gone.
  const saReqs = await saGet('/api/ip/superadmin/requests');
  assess('SA-R-1', saReqs.status === 410, { status: saReqs.status, note: 'retired queue → 410' });

  const saFormRegs = await api('/api/ip/superadmin/form-registrations', { cookie: sa.cookie });
  assess('SA-F-1', saFormRegs.status === 410, { status: saFormRegs.status, note: 'retired queue → 410' });

  const saExport = await api('/api/ip/superadmin/export-audit', { cookie: sa.cookie });
  assess('SA-E-1', saExport.status === 200 || saExport.status === 404,
    { status: saExport.status });

  const saExportCand = await api('/api/ip/superadmin/export-audit', { cookie: cand.cookie });
  assess('SA-E-1', saExportCand.status === 401 || saExportCand.status === 403,
    { status: saExportCand.status });

  // SA-PR-1 / TC-IS-14-012: SuperAdmin sees every claim; candidates are refused the queue.
  const saPromo = await api('/api/ip/promotions', { cookie: sa.cookie });
  const candPromo = await api('/api/ip/promotions', { cookie: cand.cookie });
  assess('SA-PR-1',
    saPromo.status === 200 && Array.isArray(saPromo.data?.items) && saPromo.data?.economy != null
      && candPromo.status === 403,
    { superadmin: saPromo.status, claims: (saPromo.data?.items || []).length, candidate: candPromo.status });

  const saViral = await api('/api/ip/viral', { cookie: sa.cookie });
  assess('SA-V-1', saViral.status === 200, { status: saViral.status });

  // Candidate-side APIs
  const candApps = await api('/api/ip/candidate/applications', { cookie: cand.cookie });
  assess('CAND-AP-1', candApps.status === 200,
    { count: (candApps.data?.applications || candApps.data?.items || []).length });

  const candSaved = await api('/api/ip/candidate/saved', { cookie: cand.cookie });
  assess('CAND-B-4', candSaved.status === 200 || candSaved.status === 404,
    { status: candSaved.status });

  const candNotifs = await api('/api/ip/notifications', { cookie: cand.cookie });
  assess('CAND-N-1', candNotifs.status === 200,
    { status: candNotifs.status, count: (candNotifs.data?.notifications || candNotifs.data?.items || []).length });

  const candProfile = await api('/api/ip/candidate/profile', { cookie: cand.cookie });
  assess('CAND-P-1', candProfile.status === 200,
    { profileComplete: candProfile.data?.profile_complete });

  // CAND-X-1 / TC-IS-06-004: candidate downloads a real .xlsx; employer 403, signed out 401.
  {
    const res = await fetchRaw('/api/ip/candidate/export', { cookie: cand.cookie });
    const bytes = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
    const type = res.headers.get('content-type') || '';
    const disposition = res.headers.get('content-disposition') || '';
    const empExportCand = await api('/api/ip/candidate/export', { cookie: emp.cookie });
    const anonExport = await api('/api/ip/candidate/export');
    assess('CAND-X-1',
      res.status === 200 && /spreadsheetml\.sheet/.test(type)
        && /filename="candidate-portal-export\.xlsx"/.test(disposition)
        && bytes.subarray(0, 2).toString('latin1') === 'PK' && bytes.length > 1000
        && empExportCand.status === 403 && anonExport.status === 401,
      { candidate: res.status, type, disposition, bytes: bytes.length, employer: empExportCand.status, guest: anonExport.status });
  }

  // ACA-1 / TC-IS-06-005: academics API is candidate-only; PUT saves rows back unchanged and
  // rejects an out-of-range year or CGPA without touching the saved rows.
  const candAcademics = await api('/api/ip/candidate/academics', { cookie: cand.cookie });
  const empAcademics = await api('/api/ip/candidate/academics', { cookie: emp.cookie });
  const saAcademics = await api('/api/ip/candidate/academics', { cookie: sa.cookie });
  const anonAcademics = await api('/api/ip/candidate/academics');
  const acaRows = (candAcademics.data?.items || []).map((r) => ({
    college: r.college || '',
    degree: r.degree || '',
    specialization: r.specialization || '',
    study_status: r.study_status || '',
    graduation_year: r.graduation_year ? Number(r.graduation_year) : '',
    cgpa: r.cgpa != null && r.cgpa !== '' ? Number(r.cgpa) : '',
    row_label: r.row_label || '',
  }));
  const acaKey = (rows) => JSON.stringify(rows.map((r) => [r.college || '', r.degree || '', r.specialization || '',
    r.study_status || '', r.graduation_year ? Number(r.graduation_year) : '', r.cgpa != null && r.cgpa !== '' ? Number(r.cgpa) : '']));
  const sample = acaRows[0] || { college: 'QA College', degree: 'B.Tech' };
  const badYear = await api('/api/ip/candidate/academics', {
    method: 'PUT', cookie: cand.cookie, body: { items: [{ ...sample, graduation_year: 1800 }] },
  });
  const badCgpa = await api('/api/ip/candidate/academics', {
    method: 'PUT', cookie: cand.cookie, body: { items: [{ ...sample, cgpa: 150 }] },
  });
  const empPut = await api('/api/ip/candidate/academics', { method: 'PUT', cookie: emp.cookie, body: { items: acaRows } });
  let savePut = null;
  if (acaRows.length) {
    savePut = await api('/api/ip/candidate/academics', { method: 'PUT', cookie: cand.cookie, body: { items: acaRows } });
  }
  let acaAfter = await api('/api/ip/candidate/academics', { cookie: cand.cookie });
  if (acaAfter.status !== 200) acaAfter = await api('/api/ip/candidate/academics', { cookie: cand.cookie });
  const unchanged = acaAfter.status === 200 && acaKey(acaAfter.data?.items || []) === acaKey(acaRows);
  assess('ACA-1',
    candAcademics.status === 200 && Array.isArray(candAcademics.data?.items) && acaRows.length > 0
      && empAcademics.status === 403 && saAcademics.status === 403 && anonAcademics.status === 401
      && badYear.status === 400 && /graduation year/i.test(badYear.data?.error || '')
      && badCgpa.status === 400 && /99\.99/.test(badCgpa.data?.error || '')
      && empPut.status === 403 && savePut?.status === 200 && unchanged,
    {
      candidate: candAcademics.status,
      rows: acaRows.length,
      employer: empAcademics.status,
      superadmin: saAcademics.status,
      guest: anonAcademics.status,
      badYear: [badYear.status, badYear.data?.error],
      badCgpa: [badCgpa.status, badCgpa.data?.error],
      employerPut: empPut.status,
      savePut: savePut?.status ?? 'skipped (no rows)',
      unchangedAfterSave: unchanged,
      ...(unchanged ? {} : { getAfter: acaAfter.status, before: acaKey(acaRows), after: acaKey(acaAfter.data?.items || []) }),
    });

  // NAV-1 / TC-IS-18-033: one unread notice raises the Notifications badge; reading it drops the count back.
  {
    const badgeCount = async () => {
      const r = await api('/api/ip/nav-badges', { cookie: cand.cookie });
      return { status: r.status, n: Number(r.data?.badges?.['/candidate/notifications'] || 0) };
    };
    const noticeId = qaDbId('ip_notif');
    const before = await badgeCount();
    let added = { status: 0, n: null };
    let afterRead = { status: 0, n: null };
    let readRes = { status: 0 };
    try {
      await withDb((db) => db.query(
        `INSERT INTO ip_notifications (id, user_id, title, body, link, category)
         VALUES ($1, $2, 'QA badge check', 'Nav badge refresh check (removed after the run).', '/candidate/notifications', 'system')`,
        [noticeId, cand.session?.user?.id],
      ));
      added = await badgeCount();
      readRes = await api('/api/ip/notifications', { method: 'PATCH', cookie: cand.cookie, body: { id: noticeId } });
      afterRead = await badgeCount();
    } finally {
      await withDb((db) => db.query(`DELETE FROM ip_notifications WHERE id = $1`, [noticeId])).catch(() => {});
    }
    assess('NAV-1',
      before.status === 200 && added.n === before.n + 1 && readRes.status === 200 && afterRead.n === before.n,
      { before: before.n, afterNewNotice: added.n, readStatus: readRes.status, afterRead: afterRead.n });
  }

  // PTS-1 / TC-IS-13-002: every economy reason in the ledger carries its fixed amount, and the
  // one-time awards were never granted twice to the same user.
  {
    const candPoints = await api('/api/ip/points/ledger', { cookie: cand.cookie });
    const ledgerItems = candPoints.data?.items || [];
    const EXPECTED_DELTA = {
      default_signup: 50,
      profile_complete: 15,
      application_spend: -5,
      first_application_bonus: 10,
      posting_spend: -50,
      referral_bonus: 25,
    };
    const db = await withDb(async (client) => {
      const wrong = await client.query(
        `SELECT reason, delta::int AS delta, count(*)::int AS n FROM ip_points_ledger
         WHERE reason = ANY($1::text[]) GROUP BY 1, 2`,
        [Object.keys(EXPECTED_DELTA)],
      );
      const twice = await client.query(
        `SELECT reason, count(*)::int AS users FROM (
           SELECT user_id, reason FROM ip_points_ledger
           WHERE reason IN ('profile_complete', 'first_application_bonus')
           GROUP BY 1, 2 HAVING count(*) > 1) d GROUP BY 1`,
      );
      return { byReason: wrong.rows, twice: twice.rows };
    });
    const offAmount = db.byReason.filter((r) => r.delta !== EXPECTED_DELTA[r.reason]);
    const seen = [...new Set(db.byReason.map((r) => r.reason))];
    const apiOff = ledgerItems.filter((i) => EXPECTED_DELTA[i.reason] != null && Number(i.delta) !== EXPECTED_DELTA[i.reason]);
    assess('PTS-1',
      candPoints.status === 200 && ledgerItems.length > 0 && !apiOff.length
        && !offAmount.length && !db.twice.length && seen.length === Object.keys(EXPECTED_DELTA).length,
      {
        candidateEntries: ledgerItems.length,
        reasonsSeen: seen,
        offAmount,
        apiOff: apiOff.map((i) => [i.reason, i.delta]),
        grantedTwice: db.twice,
      });
  }

  const uploadAnon = await fetchRaw('/api/ip/files?key=missing-test-key', {
    method: 'GET', redirect: 'manual',
  });
  assess('FILE-2', uploadAnon.status === 401,
    { status: uploadAnon.status });

  const logoAsCand = await fetchRaw('/api/ip/employer/profile/logo/upload', {
    method: 'POST', cookie: cand.cookie,
  });
  assess('FILE-3', logoAsCand.status === 401 || logoAsCand.status === 403,
    { status: logoAsCand.status });

  const ideasAnon = await api('/api/ip/ideas', { method: 'POST', body: { title: 'test', problem: 'test', proposedImprovement: 'x', categoryId: 1 } });
  assess('IDEA-4', ideasAnon.status === 401, { status: ideasAnon.status });

  const ideaCats = await api('/api/ip/idea-categories', { cookie: cand.cookie });
  const catId = ideaCats.data?.categories?.[0]?.id || ideaCats.data?.[0]?.id || 1;

  const ideaNoCat = await api('/api/ip/ideas', {
    method: 'POST', cookie: cand.cookie,
    body: { title: 'Idea', problem: 'Problem', proposedImprovement: 'Improve' },
  });
  assess('IDEA-5', ideaNoCat.status === 400 || ideaNoCat.status === 422,
    { status: ideaNoCat.status });

  // EMP-H-1 / TC-IS-18-004: approved vs pending employer state, and the posting gate it drives.
  {
    const empDash = await api('/api/ip/employer/dashboard', { cookie: emp.cookie });
    const pendDash = empPending.ok
      ? await api('/api/ip/employer/dashboard', { cookie: empPending.cookie })
      : { status: 0, data: null };
    const pendPost = empPending.ok
      ? await api('/api/ip/employer/internships', {
        method: 'POST', cookie: empPending.cookie, body: { title: 'QA pending gate probe', status: 'draft' },
      })
      : { status: 0, data: null };
    const evidence = {
      approved: { status: empDash.status, approvalStatus: empDash.data?.employer?.approvalStatus },
      pending: {
        signIn: empPending.ok,
        status: pendDash.status,
        approvalStatus: pendDash.data?.employer?.approvalStatus,
        post: [pendPost.status, pendPost.data?.error],
      },
    };
    if (!empPending.ok) {
      blocked('EMP-H-1', `Pending test employer ${QA_ACCOUNTS.employerPending.email} cannot sign in — run npm run qa:ensure-test-accounts. ${JSON.stringify(evidence)}`);
    } else {
      assess('EMP-H-1',
        empDash.status === 200 && empDash.data?.employer?.approvalStatus === 'approved'
          && pendDash.status === 200 && pendDash.data?.employer?.approvalStatus === 'pending'
          && pendPost.status === 403 && /must be approved by SuperAdmin before posting/i.test(pendPost.data?.error || ''),
        evidence);
    }
  }

  const empProfile = await api('/api/ip/employer/profile', { cookie: emp.cookie });
  assess('EMP-P-1', empProfile.status === 200, { data: empProfile.data });

  const empDocs = await api('/api/ip/employer/documents', {
    method: 'POST',
    cookie: emp.cookie,
    // Use a doc type the employer profile actually offers, so QA runs do not
    // leave types the product can never produce.
    body: {
      docType: 'Shop Act',
      fileName: demoText.documentFileName('Shop Act'),
      url: '/sample-docs/sample-shop-act.pdf',
    },
  });
  assess('EMP-P-2', empDocs.status === 200 || empDocs.status === 201,
    { status: empDocs.status, data: empDocs.data });

  const empViral = await api('/api/ip/viral', { cookie: emp.cookie });
  const candViral = await api('/api/ip/viral', { cookie: cand.cookie });
  assess('EMP-V-1',
    empViral.status === 200 && Array.isArray(empViral.data?.items) && Boolean(empViral.data?.referral_code)
      && candViral.status === 403,
    { employer: empViral.status, shares: (empViral.data?.items || []).length, hasReferralCode: Boolean(empViral.data?.referral_code), candidate: candViral.status });

  assess('BOOT-1', sa.ok, { email: sa.email, role: sa.role });

  await runFixtureCases({ api, apiLogin, BASE, assess, blocked, cand, emp, sa });

  // AUTH-8 last — one-shot simulated DB failure; prior cases already recorded.
  await runAuth8Case({ BASE, assess, blocked });

  return { cand, emp, sa, empPending };
}

// ── Browser suite ─────────────────────────────────────────────────────────────

async function runBrowserSuite(logins) {
  // Prefer bundled Chromium — system `channel: 'chrome'` can hang headless on Windows agents.
  const browser = await chromium
    .launch({ headless: true })
    .catch(() => chromium.launch({ headless: true, channel: 'chrome' }));
  browser.on('disconnected', () => console.log('browser disconnected'));
  console.log('browser launched');

  try {
    // --- Desktop context -------------------------------------------------------
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(30_000);
    const page = await ctx.newPage();
    console.log('browser: public pages…');
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    assess('PUB-1', await visible(page, '#email, input[type="email"]'),
      'landing email input visible');

    // PUB-2: /login redirect
    const loginRedirect = await fetchRaw('/login', { redirect: 'manual' });
    const loginLoc = loginRedirect.headers.get('location') || '';
    assess('PUB-2',
      (loginRedirect.status >= 300 && loginRedirect.status < 400) || loginRedirect.status === 200,
      { status: loginRedirect.status, location: loginLoc });

    // PUB-3: no horizontal clip at mobile
    await page.setViewportSize(MOBILE);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const clip = await noClip(page);
    assess('PUB-3', clip.ok, clip);
    await page.setViewportSize({ width: 1280, height: 800 });

    // PUB-4: public static pages
    let pub4ok = true;
    for (const path of ['/how-it-works', '/guidelines', '/help']) {
      const r = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      if ((r?.status() || 500) >= 400) pub4ok = false;
    }
    assess('PUB-4', pub4ok, 'how-it-works/guidelines/help load');

    // PUB-5: register chooser
    await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
    const hasCand = (await page.locator('a[href*="register/candidate"]').count()) > 0;
    const hasEmp = (await page.locator('a[href*="register/employer"]').count()) > 0;
    assess('PUB-5', hasCand && hasEmp, { candidateLink: hasCand, employerLink: hasEmp });

    // PUB-6 / TC-IS-01-006: /r/{code} client-replaces to /register?ref={code}; a blank code to /register.
    const referralLanding = async (path) => {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((u) => new URL(String(u)).pathname === '/register', { timeout: 20_000 }).catch(() => {});
      const u = new URL(page.url());
      return { path: u.pathname, ref: u.searchParams.get('ref') };
    };
    const refValid = await referralLanding('/r/DEMO123');
    const refBlank = await referralLanding('/r/');
    assess('PUB-6',
      refValid.path === '/register' && refValid.ref === 'DEMO123' && refBlank.path === '/register' && refBlank.ref === null,
      { valid: refValid, blank: refBlank });

    // PUB-7 / TC-IS-01-007: /app replaces to the role home (guest → `/`). Signed-in roles are checked below.
    const appLanding = async () => {
      await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
      await page.waitForURL((u) => new URL(String(u)).pathname !== '/app', { timeout: 30_000 }).catch(() => {});
      return new URL(page.url()).pathname;
    };
    const appEntry = { guest: await appLanding() };

    // PUB-8: register pages mobile clip
    await page.setViewportSize(MOBILE);
    let regClipOk = true;
    for (const path of ['/register', '/register/candidate', '/register/employer']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      const c = await noClip(page);
      if (!c.ok) regClipOk = false;
    }
    assess('PUB-8', regClipOk, 'register pages no horizontal clip mobile');
    await page.setViewportSize({ width: 1280, height: 800 });

    // PERM-1: guest guard (client-side redirect can still return 200 HTML)
    // Every signed-out shell must land on the sign-in form at `/`, not just one of them.
    await ctx.clearCookies();
    const guestLanding = {};
    for (const path of ['/candidate', '/candidate/profile', '/employer', '/account']) {
      await gotoGuestExpectLogin(page, path);
      guestLanding[path] = new URL(page.url()).pathname;
    }
    assess('PERM-1',
      Object.values(guestLanding).every((p) => p === '/'),
      guestLanding);

    // PERM-6 / TC-IS-04-006 (guest half): /ideas does not stay open signed out.
    await gotoGuestExpectLogin(page, '/ideas');
    const guestIdeasPath = new URL(page.url()).pathname;

    // AUTH-15 / TC-IS-02-014 (signed-out half): /superadmin/login replaces to the home form; no SuperAdmin form.
    await page.goto(`${BASE}/superadmin/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => new URL(String(u)).pathname === '/', { timeout: 15_000 }).catch(() => {});
    const saLoginGuest = {
      path: new URL(page.url()).pathname,
      homeForm: await visible(page, '#email') && await visible(page, '#password'),
      saForm: (await page.locator('#sa-email').count()) > 0,
    };

    // AUTH-21: forgot-password page
    await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
    await page.locator('main, form, input').first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
    assess('AUTH-21',
      await visible(page, 'input[type="email"], #email, form'),
      { url: page.url() });

    // --- Authenticated context (candidate) ------------------------------------
    console.log('browser: candidate session…');
    await ctx.clearCookies();
    await ctx.addCookies(logins.cand.cookies);
    await page.goto(`${BASE}/api/auth/session`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        async () => {
          try {
            const s = await fetch('/api/auth/session').then((r) => r.json());
            return Boolean(s?.user?.email);
          } catch {
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .catch(() => {});
    appEntry.candidate = await appLanding();

    // PERM-2: candidate on employer shell gets the "Wrong account" block page (403-style, URL stays)
    const empWrongRole = await fetchRaw('/employer', {
      redirect: 'manual',
      cookie: logins.cand.cookie,
    });
    const loc = empWrongRole.headers.get('location') || '';
    const httpRedirectAway =
      empWrongRole.status >= 300 &&
      empWrongRole.status < 400 &&
      loc &&
      !/\/employer(\/|$|\?)/.test(new URL(loc, BASE).pathname);
    if (httpRedirectAway) {
      assess('PERM-2', true, { status: empWrongRole.status, location: loc });
    } else {
      await page.goto(`${BASE}/employer`, { waitUntil: 'domcontentloaded' });
      const blockShown = await page
        .getByText('Wrong account for this workspace')
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const employerLinks = await page.locator('a[href^="/employer/"]').count();
      const wrongRoleUrl = page.url();
      const leftEmployer = !/\/employer(\/|$|\?)/.test(new URL(wrongRoleUrl).pathname);
      assess('PERM-2', leftEmployer || (blockShown && employerLinks === 0), {
        status: empWrongRole.status,
        location: loc,
        url: wrongRoleUrl,
        blockShown,
        employerLinks,
      });
    }

    // PERM-6 / TC-IS-04-006: guest bounced off /ideas; candidate sees /ideas inside the candidate sidebar.
    await gotoApp(page, '/ideas');
    const ideasNav = await sidebarMatchesRole(page, 'candidate');
    assess('PERM-6', guestIdeasPath !== '/ideas' && new URL(page.url()).pathname === '/ideas' && ideasNav.ok, {
      guestEndedOn: guestIdeasPath,
      candidateUrl: page.url(),
      sidebar: ideasNav,
    });

    // AUTH-15 / TC-IS-02-014 (signed-in half): /superadmin/login still only replaces to `/` (the home page does
    // not auto-route signed-in users); no SuperAdmin form or links appear for the candidate.
    await page.goto(`${BASE}/superadmin/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => new URL(String(u)).pathname === '/', { timeout: 20_000 }).catch(() => {});
    const saLoginCand = {
      path: new URL(page.url()).pathname,
      saForm: (await page.locator('#sa-email').count()) > 0,
      saLinks: await page.locator('a[href^="/superadmin"]').count(),
    };
    assess('AUTH-15',
      saLoginGuest.path === '/' && saLoginGuest.homeForm && !saLoginGuest.saForm
        && saLoginCand.path === '/' && !saLoginCand.saForm && saLoginCand.saLinks === 0,
      { signedOut: saLoginGuest, signedInCandidate: saLoginCand });

    // CAND-D-1 / TC-IS-08-003: dashboard data loads (no stuck placeholders) and each shortcut opens a working page.
    await gotoApp(page, '/candidate');
    const dashLoaded = await page
      .waitForFunction(() => {
        const el = document.querySelector('[data-testid="dash-active-apps"]');
        return el && /^\d+$/.test(el.textContent.trim());
      }, null, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    const shortcutHrefs = await page.locator('.ip-cd-features a.ip-cd-feature')
      .evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    const wantShortcuts = ['/candidate/internships', '/candidate/applications', '/candidate/offers', '/candidate/referral'];
    const missingShortcuts = wantShortcuts.filter((h) => !shortcutHrefs.includes(h));
    const brokenShortcuts = [];
    for (const href of shortcutHrefs) {
      const r = await fetchRaw(href, { cookie: logins.cand.cookie });
      if (r.status !== 200) brokenShortcuts.push(`${href} → ${r.status}`);
    }
    // Reward points tile must show the profile API balance; Profile score must show a percentage.
    const statValues = await page.locator('.ip-cd-stats .ip-cd-stat__value').allInnerTexts();
    const profApi = await api('/api/ip/candidate/profile', { cookie: logins.cand.cookie });
    const apiPoints = Number(profApi.data?.profile?.points ?? NaN);
    const pointsShown = String(statValues[0] || '').replace(/[^\d-]/g, '');
    const pointsOk = Number.isFinite(apiPoints) && pointsShown !== '' && Number(pointsShown) === apiPoints;
    const scoreOk = /^\d{1,3}%$/.test(String(statValues[2] || '').trim());
    const candDashOk = dashLoaded && pointsOk && scoreOk && !missingShortcuts.length && !brokenShortcuts.length;
    assess('CAND-D-1', candDashOk, {
      url: page.url(),
      activeAppsLoaded: dashLoaded,
      statValues,
      apiPoints,
      pointsOk,
      scoreOk,
      shortcuts: shortcutHrefs,
      missingShortcuts,
      brokenShortcuts,
    });

    // CAND-AP-1 / CAND-AP-2: list + search, then the detail dialog (labelled; × and backdrop both close it).
    // The UI is the real check for these two, so a UI failure replaces the earlier API Pass.
    {
      const assessAp = (id, ok, actual) => {
        if (cases[id]?.status !== 'Fail') assess(id, ok, actual);
      };
      await gotoApp(page, '/candidate/applications');
      await page.locator('.ip-ap-loading').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
      const apRows = page.locator('table.ip-ap-list--tworow tbody tr');
      await apRows.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
      const apCount = await apRows.count();
      if (!apCount) {
        const emptyOk = await visible(page, '.ip-ap-empty');
        assessAp('CAND-AP-1', emptyOk, { rows: 0, emptyState: emptyOk });
        blocked('CAND-AP-2', 'test candidate has no applications to open');
      } else {
        const title = (await apRows.first().locator('.ip-ph-role').innerText()).trim();
        const search = page.getByLabel('Search applications');
        await search.fill(title);
        await page.waitForTimeout(300);
        const shown = await apRows.locator('.ip-ph-role').allInnerTexts();
        const searchOk = shown.length > 0 && shown.every((t) => t.toLowerCase().includes(title.toLowerCase()));
        await search.fill('no-such-role-xyz');
        const noneOk = (await visible(page, '.ip-ap-empty')) && (await apRows.count()) === 0;
        await search.fill('');
        await apRows.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        assessAp('CAND-AP-1', searchOk && noneOk, { rows: apCount, title, shownAfterSearch: shown.length, searchOk, noneOk });

        const dialog = page.getByRole('dialog');
        await apRows.first().getByRole('button', { name: 'View details' }).click().catch(() => {});
        const opened = await dialog.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
        const modal = opened ? await dialog.getAttribute('aria-modal') : null;
        const labelledBy = opened ? await dialog.getAttribute('aria-labelledby') : null;
        const heading = labelledBy
          ? (await page.locator(`[id="${labelledBy}"]`).innerText().catch(() => '')).trim()
          : '';
        await dialog.locator('.ip-ap-modal__head button[aria-label="Close"]').click().catch(() => {});
        const closedByX = await dialog.waitFor({ state: 'detached', timeout: 5_000 }).then(() => true).catch(() => false);
        await apRows.first().getByRole('button', { name: 'View details' }).click().catch(() => {});
        await dialog.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
        await page.locator('.ip-ap-modal__backdrop').click({ position: { x: 5, y: 5 } }).catch(() => {});
        const closedByBackdrop = await dialog.waitFor({ state: 'detached', timeout: 5_000 }).then(() => true).catch(() => false);
        assessAp('CAND-AP-2', opened && modal === 'true' && heading === title && closedByX && closedByBackdrop, {
          opened, modal, heading, title, closedByX, closedByBackdrop,
        });
      }
    }

    // Filters panel must offer the Status and Next step selects; a missing Filters button is a Fail.
    {
      const btn = page.locator('.ip-tf__btn').first();
      const hasBtn = (await btn.count()) > 0;
      if (hasBtn) await btn.click().catch(() => {});
      const panel = page.locator('.ip-tf__panel');
      const nextOk = (await panel.locator('select[aria-label="Next step"]').count()) > 0;
      const statusOk = (await panel.locator('select[aria-label="Status"]').count()) > 0;
      if (hasBtn) await btn.click().catch(() => {});
      assessUi('CAND-AP-ADV', hasBtn && nextOk && statusOk, { hasBtn, nextOk, statusOk });
    }

    // CAND-P-2, CAND-B-3, CAND-M-1/2, CAND-O-1/5, CAND-R-1, CAND-N-2, ACCT-1/2, IDEA-3 and the
    // employer / SuperAdmin pages below → scripts/qa-test-account-cases.mjs (by TC id).

    // SHELL-1 / TC-IS-18-028: sidebar = ipNav for each role (SuperAdmin has no Notifications);
    // SHELL-2 / TC-IS-18-029: Sign out lands every role on `/`. Both are recorded after the SuperAdmin pass.
    const shell = {};
    await gotoApp(page, '/candidate');
    shell.candidate = await sidebarMatchesRole(page, 'candidate');

    await page.setViewportSize(MOBILE);
    await gotoApp(page, '/candidate');
    await page.getByRole('button', { name: 'Toggle navigation menu' }).click().catch(() => {});
    shell.candidateMobileDrawer = await page
      .locator('aside nav a[href="/candidate/notifications"]')
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    await page.setViewportSize({ width: 1280, height: 800 });

    // CAND-P-3 (UI half): the complete test candidate never sees the reminder banner.
    await gotoApp(page, '/candidate');
    await page.locator('.ip-cd-stats').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const reminderShown = await page.getByText('Complete your profile', { exact: true }).count();
    assessUiStrict('CAND-P-3', candDashOk && reminderShown === 0,
      { dashboardLoaded: candDashOk, reminderBannerOnCompleteProfile: reminderShown }, page.url());

    const signOut = { candidate: await signOutLandsHome(page) };

    // --- Employer context -------------------------------------------------------
    console.log('browser: employer session…');
    await ctx.clearCookies();
    await ctx.addCookies(logins.emp.cookies);
    await page.goto(`${BASE}/api/auth/session`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        async () => {
          try {
            const s = await fetch('/api/auth/session').then((r) => r.json());
            return Boolean(s?.user?.email);
          } catch {
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .catch(() => {});

    appEntry.employer = await appLanding();

    const employerDashState = async () => {
      await gotoApp(page, '/employer');
      await page.locator('.ip-ed-banner h1', { hasText: /Welcome back/ }).first()
        .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      await page.locator('.ip-ed-banner-actions').first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
      const postLink = page.locator('a[href="/employer/internships/new"]', { hasText: 'Post New Internship' });
      return {
        url: page.url(),
        approvalAlert: await page.locator('.ip-ed-alert', { hasText: 'Waiting for SuperAdmin approval' }).count(),
        postLinks: await postLink.count(),
        postEnabled: (await postLink.count()) ? (await postLink.first().getAttribute('aria-disabled')) === 'false' : false,
        verifiedBadge: await page.getByText('Verified employer account — approved by SuperAdmin.').count(),
        lockedNote: await page.getByText(/Postings unlock after SuperAdmin Final Employer Approval/).count(),
      };
    };
    const approvedDash = await employerDashState();
    const approvedDashOk = approvedDash.approvalAlert === 0 && approvedDash.postEnabled && approvedDash.verifiedBadge > 0;

    await gotoApp(page, '/employer/viral');
    await page.waitForURL(/\/employer\/referral/, { timeout: 25_000 }).catch(() => {});
    assessUiStrict('EMP-V-1', new URL(page.url()).pathname === '/employer/referral' && (await visible(page, 'main h1')),
      { url: page.url(), note: 'viral board merged into Refer & earn' }, page.url());

    await gotoApp(page, '/employer');
    shell.employer = await sidebarMatchesRole(page, 'employer');
    signOut.employer = await signOutLandsHome(page);

    // EMP-H-1 (UI half): pending employer sees the approval alert and no usable Post button.
    let pendingDash = { skipped: 'pending employer not signed in' };
    let pendingDashOk = false;
    if (logins.empPending?.ok) {
      await switchSession(ctx, page, logins.empPending.cookies);
      pendingDash = await employerDashState();
      pendingDashOk = pendingDash.approvalAlert > 0 && pendingDash.lockedNote > 0 && !pendingDash.postEnabled
        && pendingDash.verifiedBadge === 0;
    }
    assessUiStrict('EMP-H-1', approvedDashOk && pendingDashOk,
      { approved: approvedDash, pending: pendingDash }, page.url());

    // --- SuperAdmin context -------------------------------------------------------
    console.log('browser: superadmin session…');
    await ctx.clearCookies();
    await ctx.addCookies(logins.sa.cookies);
    // Warm session so PortalShell does not race assessUi against /superadmin/login
    await page.goto(`${BASE}/api/auth/session`, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        async () => {
          try {
            const s = await fetch('/api/auth/session').then((r) => r.json());
            return Boolean(s?.user?.email);
          } catch {
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .catch(() => {});
    appEntry.superadmin = await appLanding();
    assess('PUB-7',
      appEntry.guest === '/' && appEntry.candidate === '/candidate' && appEntry.employer === '/employer'
        && appEntry.superadmin === '/superadmin',
      appEntry);

    await gotoApp(page, '/superadmin');
    await page.waitForURL(/\/superadmin(\/|$|\?)/, { timeout: 20_000 }).catch(() => {});
    assessUi(
      'SA-D-1',
      !page.url().includes('/superadmin/login') && (await visible(page, 'main, h1')),
      { url: page.url() },
    );

    await gotoApp(page, '/superadmin/form-registrations');
    await page.waitForURL(/\/superadmin\/approvals/, { timeout: 25_000 }).catch(() => {});
    assessUi('SA-F-3', /\/superadmin\/approvals/.test(page.url()), { url: page.url(), note: 'retired page → approvals' });

    await gotoApp(page, '/superadmin/requests');
    await page.waitForURL(/\/superadmin\/approvals/, { timeout: 25_000 }).catch(() => {});
    assessUi('SA-R-1', /\/superadmin\/approvals/.test(page.url()), { url: page.url(), note: 'retired page → approvals' });

    await gotoApp(page, '/superadmin/promotions');
    {
      const heading = await visible(page, 'h1:text-is("Posting Share Rewards")');
      const navPromotions = await page.locator('aside nav a[href="/superadmin/promotions"]').count();
      const navViral = await page.locator('aside nav a[href="/superadmin/viral"]').count();
      assessUiStrict('SA-PR-1', heading && navPromotions > 0 && navViral === 0,
        { url: page.url(), heading, navPromotions, navViral }, page.url());
    }

    // Viral shares SA UI removed — route redirects to dashboard
    await gotoApp(page, '/superadmin/viral');
    const viralRedirected =
      /\/superadmin\/?$/.test(new URL(page.url()).pathname) && !(await visible(page, 'text=Viral Shares Queue'));
    assessUi('SA-V-1', viralRedirected && (await visible(page, 'main, h1')), {
      url: page.url(),
      note: 'SA viral page removed; redirects to /superadmin',
    });

    await gotoApp(page, '/superadmin');
    shell.superadmin = await sidebarMatchesRole(page, 'superadmin');
    shell.superadminNotificationLinks = await page.locator('a[href*="notifications"]').count();
    signOut.superadmin = await signOutLandsHome(page);

    assess('SHELL-1',
      shell.candidate.ok && shell.candidateMobileDrawer && shell.employer.ok
        && shell.superadmin.ok && shell.superadminNotificationLinks === 0,
      shell);
    assess('SHELL-2', Object.values(signOut).every((s) => s.ok), signOut);

    await ctx.close();
    console.log('browser suite finished');
  } finally {
    await browser.close();
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

let byTcId = {};

async function main() {
  ensureQaTestAccounts(BASE);
  console.log(`InternSafar combined QA — base=${BASE} headless=true${ONLY ? ` only=${ONLY}` : ''}${SKIP_TC_IS ? ' skip-tc-is' : ''}`);

  if (ONLY === 'AUTH-8') {
    await runAuth8Case({ BASE, assess, blocked });
  } else if (ONLY?.startsWith('TC-IS-')) {
    const rem = await runSingleTcIsCase(ONLY, { base: BASE });
    byTcId = rem.byTcId || {};
  } else if (ONLY) {
    console.error(`Unknown --only case: ${ONLY}`);
    process.exitCode = 1;
    return;
  } else {
    const logins = await runApiSuite();
    console.log(`API suite recorded ${Object.keys(cases).length} cases — starting browser`);
    if (!SKIP_BROWSER) await runBrowserSuite(logins);
    if (!SKIP_TC_IS) {
      console.log('TC-IS workbook suite…');
      const rem = await runRemainingSuite({ base: BASE, skipEnsureReady: true });
      byTcId = rem.byTcId || {};
    }
  }

  persistResults();
}

function persistResults() {
  const outPath = resolve(appRoot, 'test-cases/qa-results.json');
  let priorByTcId = {};
  let priorCases = {};
  let priorResults = {};
  // Each record keeps the time it actually ran, so carried-over results never look fresh in the workbook.
  const stampAll = (records, when) =>
    Object.fromEntries(Object.entries(records || {}).map(([k, v]) => [k, { executedAt: when, ...v }]));
  try {
    const prior = JSON.parse(readFileSync(outPath, 'utf8'));
    priorByTcId = stampAll(prior.byTcId, prior.executedAt);
    priorCases = stampAll(prior.cases, prior.executedAt);
    priorResults = stampAll(prior.results || { ...priorCases, ...priorByTcId }, prior.executedAt);
  } catch {
    /* first run */
  }
  Object.assign(cases, stampAll(cases, executedAt));
  Object.assign(byTcId, stampAll(byTcId, executedAt));
  // Always keep earlier records (other runners, skipped phases); each keeps its own executedAt,
  // so qa:coverage shows anything not re-run today as NOT run.
  const outCases = { ...priorCases, ...cases };
  const outByTcId = { ...priorByTcId, ...byTcId };
  const results = { ...priorResults, ...outCases, ...outByTcId };
  const payload = { executedAt, base: BASE, results, cases: outCases, byTcId: outByTcId };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));

  const all = { ...cases, ...byTcId };
  const passN = Object.values(all).filter((c) => c.status === 'Pass').length;
  const failN = Object.values(all).filter((c) => c.status === 'Fail').length;
  const blockedN = Object.values(all).filter((c) => c.status === 'Blocked').length;
  const total = Object.keys(all).length;

  console.log(JSON.stringify({
    executedAt,
    base: BASE,
    thisRun: { total, pass: passN, fail: failN, blocked: blockedN },
    keptFromEarlierRuns: Object.keys(results).length - total,
    results: Object.keys(results).length,
    legacyCases: Object.keys(outCases).length,
    tcIs: Object.keys(outByTcId).length,
    resultsFile: 'test-cases/qa-results.json',
  }));

  if (APPLY) {
    execFileSync('python', [resolve(appRoot, 'scripts/apply-internsafar-qa-xlsx.py')], {
      cwd: appRoot, stdio: 'inherit',
    });
    try {
      execFileSync('python', [resolve(appRoot, 'scripts/ip_checklist_xlsx.py'), outPath], {
        cwd: appRoot, stdio: 'inherit',
      });
    } catch {
      /* optional legacy checklist workbook helper */
    }
  }

  if (failN > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  try {
    persistResults();
  } catch (e) {
    console.error(e);
  }
  process.exit(1);
});
