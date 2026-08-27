const { expect } = require('@playwright/test');
const { password } = require('./accounts');

async function fillCaptchaIfPresent(page, inputId = 'login-captcha') {
  const box = page.locator(`#${inputId}`);
  if ((await box.count()) === 0) return;
  const val = await box.inputValue().catch(() => '');
  if (!String(val).trim()) await box.fill('7');
}

async function apiLoginOnce(base, email, pwd = password) {
  const jar = new Map();
  const store = (res) => {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const single = res.headers.get('set-cookie');
    const list = raw?.length ? raw : single ? [single] : [];
    for (const c of list) {
      const part = c.split(';')[0];
      const i = part.indexOf('=');
      if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const capRes = await fetch(`${base}/api/auth/captcha`);
  store(capRes);
  const cap = await capRes.json();
  const answer =
    cap.dummyAnswer ??
    (() => {
      const m = String(cap.question || '').match(/(\d+)\s*\+\s*(\d+)/);
      return m ? Number(m[1]) + Number(m[2]) : 7;
    })();

  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { Cookie: cookie() } });
  store(csrfRes);
  const csrf = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password: pwd,
    captchaToken: cap.token,
    captchaAnswer: String(answer),
    callbackUrl: `${base}/`,
    json: 'true',
  });

  const cb = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body,
    redirect: 'manual',
  });
  const raw = await cb.text().catch(() => '');
  store(cb);

  const mPlain = raw.match(/TWO_FACTOR_REQUIRED[:\s]*([A-Za-z0-9_-]+)/);
  const mEnc = raw.match(/TWO_FACTOR_REQUIRED%3A([A-Za-z0-9_-]+)/i);
  const otpRequiredChallengeId = (mPlain ? mPlain[1] : null) || (mEnc ? mEnc[1] : null);
  const LOGIN_CODE = process.env.IP_QA_2FA_LOGIN_CODE
    ? String(process.env.IP_QA_2FA_LOGIN_CODE).trim()
    : '';

  if (otpRequiredChallengeId && LOGIN_CODE.length === 6) {
    const body2 = new URLSearchParams(body);
    body2.append('otpChallengeId', String(otpRequiredChallengeId));
    body2.append('otpCode', String(LOGIN_CODE));
    const cb2 = await fetch(`${base}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
      body: body2,
      redirect: 'manual',
    });
    store(cb2);
  }

  const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie() } });
  store(sessionRes);
  const session = await sessionRes.json().catch(() => ({}));
  const origin = new URL(base).origin;
  const cookies = [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    url: origin,
  }));
  return {
    ok: Boolean(session?.user?.email),
    session,
    cookies,
    otpRequiredChallengeId,
    raw: String(raw).slice(0, 200),
  };
}

/** Retry login — captcha/session races under load are wait/flake, not product bugs. */
async function apiLogin(base, email, pwd = password) {
  let last = { ok: false };
  for (let i = 0; i < 4; i += 1) {
    last = await apiLoginOnce(base, email, pwd);
    if (last.ok) return last;
    await new Promise((r) => setTimeout(r, 750 * (i + 1)));
  }
  return last;
}

async function openWithSession(page, email, homePath) {
  const base = process.env.IP_BASE || 'http://localhost:3000';
  const logged = await apiLogin(base, email);
  expect(
    logged.ok,
    `API login failed for ${email}${logged.otpRequiredChallengeId ? ' (2FA challenge — set IP_QA_2FA_LOGIN_CODE)' : ''}: ${logged.raw || ''}`,
  ).toBeTruthy();
  await page.context().clearCookies();
  await page.context().addCookies(logged.cookies);
  await page.goto(homePath, { waitUntil: 'domcontentloaded' });
  // Role shells use <main>; wait for shell chrome, not only path.
  await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function signInOnHome(page, email, pwd = password) {
  await page.goto('/');
  await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pwd);
  await fillCaptchaIfPresent(page);
  await page.locator('button.ip-gemini-submit[type="submit"]').click();
  await page.waitForURL(/\/(candidate|employer)(\/|$|\?)/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function signInSuperAdmin(page, email, pwd = password) {
  // Prefer API session for reliability (same path as openWithSession). UI form is covered by field smoke tests.
  const base = process.env.IP_BASE || 'http://localhost:3000';
  const logged = await apiLogin(base, email, pwd);
  if (logged.ok) {
    await page.context().clearCookies();
    await page.context().addCookies(logged.cookies);
    await page.goto('/superadmin', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => {
        const p = location.pathname;
        return p === '/superadmin' || (p.startsWith('/superadmin/') && !p.includes('/login'));
      },
      { timeout: 30_000 },
    );
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    return;
  }

  // Fallback: UI form (slower / flakier under load)
  await page.goto('/superadmin/login', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#sa-email')).toBeVisible({ timeout: 20_000 });
  await page.locator('#login-captcha').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await page.locator('#sa-email').fill(email);
  await page.locator('#sa-password').fill(pwd);
  await fillCaptchaIfPresent(page);
  await page.getByRole('button', { name: /^login$/i }).click();
  await page.waitForFunction(
    () => {
      const p = location.pathname;
      return p === '/superadmin' || (p.startsWith('/superadmin/') && !p.includes('/login'));
    },
    { timeout: 30_000 },
  );
  await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function signOut(page) {
  const btn = page.getByRole('button', { name: /sign out/i });
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
  await page.waitForURL(/\/(\?|$)|\/superadmin\/login/, { timeout: 20_000 }).catch(() => {});
}

function assertNoCrash(bodyText) {
  expect(bodyText).not.toMatch(/application error/i);
  expect(bodyText).not.toMatch(/this page could not be found/i);
}

module.exports = {
  fillCaptchaIfPresent,
  apiLogin,
  openWithSession,
  signInOnHome,
  signInSuperAdmin,
  signOut,
  assertNoCrash,
};
