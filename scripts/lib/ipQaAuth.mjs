/**
 * Shared NextAuth credentials login for IP QA scripts (API cookie jar).
 * Candidate / employers are the disposable test accounts (ipTestAccountsConfig.js) — core demo
 * accounts are never used for testing. Passwords come from .env.local (IP_QA_CORE_PASSWORD /
 * IP_QA_SUPERADMIN_PASSWORD) via ipCoreSampleConfig.
 */
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { SUPERADMIN_EMAIL, getCorePasswordForEmailOrRole } = require('./ipCoreSampleConfig.js');
const {
  TEST_CANDIDATE,
  TEST_EMPLOYER,
  TEST_EMPLOYER_PENDING,
  assertNotCoreForTesting,
} = require('./ipTestAccountsConfig.js');

function pw(email, role) {
  return getCorePasswordForEmailOrRole(email, role);
}

function account(email, role) {
  return {
    email,
    get password() {
      return pw(email, role);
    },
    role,
  };
}

export const QA_ACCOUNTS = {
  superadmin: account(SUPERADMIN_EMAIL, 'superadmin'),
  candidate: account(TEST_CANDIDATE.email, 'candidate'),
  employer: account(TEST_EMPLOYER.email, 'employer'),
  employerPending: account(TEST_EMPLOYER_PENDING.email, 'employer'),
};

/**
 * Re-create / repair the test accounts (they are dropped by IP_Reset_Core_Sample.js). Call once
 * at the start of a QA entry script. Only for hosts on the shared local/Vercel DB; other hosts
 * (AWS) need `npm run qa:ensure-test-accounts` run against their own database.
 */
export function ensureQaTestAccounts(base) {
  const sharedDb =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base) || /\.vercel\.app(\/|$)/i.test(base);
  if (!sharedDb) {
    console.log(`[qa] ${base} has its own database: run "npm run qa:ensure-test-accounts" on that host before testing.`);
    return;
  }
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      join(__dirname, '..', 'ensure-ip-test-accounts.mjs'),
      '--quiet',
    ],
    { stdio: 'inherit', shell: false },
  );
  if (r.status !== 0) {
    throw new Error('Could not create the QA test accounts — run "npm run qa:ensure-test-accounts" to see why.');
  }
}

export function cookieJar() {
  const jar = new Map();
  return {
    store(res) {
      const raw =
        typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      const single = res.headers.get('set-cookie');
      const list = raw?.length ? raw : single ? [single] : [];
      for (const c of list) {
        const part = c.split(';')[0];
        const i = part.indexOf('=');
        if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    playwrightCookies(baseUrl) {
      return [...jar.entries()].map(([name, value]) => ({ name, value, url: baseUrl }));
    },
  };
}

/** Fetch a real captcha challenge (required when CAPTCHA_BYPASS_FOR_TESTING is false). */
export async function fetchLoginCaptcha(base) {
  const jar = cookieJar();
  const capRes = await fetch(`${base}/api/auth/captcha`);
  jar.store(capRes);
  const cap = await capRes.json();
  const answer =
    cap.dummyAnswer ??
    (() => {
      const m = String(cap.question || '').match(/(\d+)\s*\+\s*(\d+)/);
      return m ? Number(m[1]) + Number(m[2]) : 7;
    })();
  return {
    captchaToken: cap.token,
    captchaAnswer: String(answer),
    cookie: jar.header(),
    jar,
  };
}

export async function apiLogin(base, email, password) {
  assertNotCoreForTesting(email);
  const { captchaToken, captchaAnswer, jar } = await fetchLoginCaptcha(base);

  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
  jar.store(csrfRes);
  const csrf = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    captchaToken,
    captchaAnswer: String(captchaAnswer),
    callbackUrl: `${base}/`,
    json: 'true',
  });

  const cb = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body,
    redirect: 'manual',
  });

  // If 2FA is enabled, NextAuth returns TWO_FACTOR_REQUIRED:<challengeId> (no session yet).
  const rawText = await cb.text().catch(() => '');
  const raw = String(rawText);
  const mPlain = raw.match(/TWO_FACTOR_REQUIRED[:\s]*([A-Za-z0-9_-]+)/);
  // NextAuth sometimes URL-encodes the message: TWO_FACTOR_REQUIRED%3A<id>
  const mEnc = raw.match(/TWO_FACTOR_REQUIRED%3A([A-Za-z0-9_-]+)/i);
  const otpRequiredChallengeId = (mPlain ? mPlain[1] : null) || (mEnc ? mEnc[1] : null);
  const errMatch = raw.match(/[?&]error=([^&"]+)/);
  let loginError = null;
  if (errMatch) {
    try {
      loginError = decodeURIComponent(errMatch[1].replace(/\+/g, ' '));
    } catch {
      loginError = errMatch[1];
    }
  }

  // Store cookies after reading response body (header parsing still works, and avoids body-state issues).
  jar.store(cb);

  const LOGIN_CODE = process.env.IP_QA_2FA_LOGIN_CODE
    ? String(process.env.IP_QA_2FA_LOGIN_CODE).trim()
    : '';

  if (otpRequiredChallengeId && LOGIN_CODE && LOGIN_CODE.length === 6) {
    const body2 = new URLSearchParams(body);
    body2.append('otpChallengeId', String(otpRequiredChallengeId));
    body2.append('otpCode', String(LOGIN_CODE));

    const cb2 = await fetch(`${base}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
      body: body2,
      redirect: 'manual',
    });
    jar.store(cb2);
  }

  const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: jar.header() } });
  jar.store(sessionRes);
  const session = await sessionRes.json();

  return {
    ok: Boolean(session?.user?.email),
    email: session?.user?.email,
    role: session?.user?.role,
    session,
    cookie: jar.header(),
    cookies: jar.playwrightCookies(base),
    otpRequiredChallengeId,
    loginError,
  };
}

/**
 * Sign in one of the QA_ACCOUNTS (key: 'candidate' | 'employer' | 'employerPending' | 'superadmin')
 * or throw a message that says how to fix it — never a bare "login failed".
 */
export async function requireQaLogin(base, key) {
  const acct = QA_ACCOUNTS[key];
  if (!acct) throw new Error(`Unknown QA account "${key}"`);
  const login = await apiLogin(base, acct.email, acct.password);
  if (login.ok) return login;
  const fix =
    key === 'superadmin'
      ? 'Check the SuperAdmin QA password in scripts/lib/ipCoreSampleConfig.js.'
      : `The test account is missing or out of date on this host — run "npm run qa:ensure-test-accounts" ` +
        `(local/Vercel share one DB; AWS needs it run on that host), then re-run.`;
  throw new Error(`QA ${key} account ${acct.email} cannot sign in on ${base}. ${fix}`);
}

export async function apiRequest(base, path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 500) };
  }
  return { status: res.status, data, text };
}
