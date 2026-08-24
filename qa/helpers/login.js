const { expect } = require('@playwright/test');
const { password } = require('./accounts');

async function fillCaptchaIfPresent(page, inputId = 'login-captcha') {
  const box = page.locator(`#${inputId}`);
  if ((await box.count()) === 0) return;
  const val = await box.inputValue().catch(() => '');
  if (!String(val).trim()) await box.fill('7');
}

async function apiLogin(base, email, pwd = password) {
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
  store(cb);

  const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie() } });
  store(sessionRes);
  const session = await sessionRes.json();
  const origin = new URL(base).origin;
  const cookies = [...jar.entries()].map(([name, value]) => ({
    name,
    value,
    url: origin,
  }));
  return { ok: Boolean(session?.user?.email), session, cookies };
}

async function openWithSession(page, email, homePath) {
  const base = process.env.IP_BASE || 'http://localhost:3000';
  const logged = await apiLogin(base, email);
  expect(logged.ok, `API login failed for ${email}`).toBeTruthy();
  await page.context().addCookies(logged.cookies);
  await page.goto(homePath);
}

async function signInOnHome(page, email, pwd = password) {
  await page.goto('/');
  await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(pwd);
  await fillCaptchaIfPresent(page);
  await page.locator('button.ip-gemini-submit[type="submit"]').click();
}

async function signInSuperAdmin(page, email, pwd = password) {
  await page.goto('/superadmin/login');
  await expect(page.locator('#sa-email')).toBeVisible({ timeout: 20_000 });
  await page.locator('#sa-email').fill(email);
  await page.locator('#sa-password').fill(pwd);
  await fillCaptchaIfPresent(page);
  await page.getByRole('button', { name: /^login$/i }).click();
}

async function signOut(page) {
  const btn = page.getByRole('button', { name: /sign out/i });
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
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
