/**
 * Shared NextAuth credentials login for IP QA scripts (API cookie jar).
 */
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  SUPERADMIN_EMAIL,
  DEMO_PASSWORD,
  CAST_CANDIDATES,
  CAST_EMPLOYERS,
} = require('./ipCoreSampleConfig.js');

export const QA_ACCOUNTS = {
  superadmin: { email: SUPERADMIN_EMAIL, password: DEMO_PASSWORD, role: 'superadmin' },
  candidate: { email: CAST_CANDIDATES[0].email, password: DEMO_PASSWORD, role: 'candidate' },
  employer: { email: CAST_EMPLOYERS[0].email, password: DEMO_PASSWORD, role: 'employer' },
  employerPending: { email: CAST_EMPLOYERS[1].email, password: DEMO_PASSWORD, role: 'employer' },
};

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

export async function apiLogin(base, email, password) {
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

  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
  jar.store(csrfRes);
  const csrf = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    captchaToken: cap.token,
    captchaAnswer: String(answer),
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
  };
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
