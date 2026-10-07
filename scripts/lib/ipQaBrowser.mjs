/**
 * Small Playwright helpers for node QA scripts that sign in through the API
 * (ipQaAuth.apiLogin → cookies) and then check pages in a real browser.
 */
import { ensurePlaywrightBrowsersPath } from './ensurePlaywrightBrowsers.mjs';

ensurePlaywrightBrowsersPath();
const { chromium } = await import('playwright');

export async function launchQaBrowser() {
  return chromium
    .launch({ headless: true })
    .catch(() => chromium.launch({ headless: true, channel: 'chrome' }));
}

/** New context + page; signed in when `login` (an apiLogin result) is given. */
export async function newQaPage(browser, login = null) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  ctx.setDefaultTimeout(30_000);
  if (login?.cookies?.length) await ctx.addCookies(login.cookies);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept().catch(() => {}));
  return page;
}

/** Open `path` and wait until a visible match for `readySel` shows (client shells hydrate late). */
export async function gotoReady(page, base, path, readySel, timeout = 60_000) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
  if (readySel) await page.locator(`${readySel} >> visible=true`).first().waitFor({ timeout });
}

/** Click until `done()` holds — first clicks on a cold dev server can land before hydration. */
export async function clickUntil(page, locator, done, { tries = 5, gapMs = 2000 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    await locator.click({ timeout: 15_000 }).catch(() => {});
    const deadline = Date.now() + gapMs;
    while (Date.now() < deadline) {
      if (await done().catch(() => false)) return true;
      await page.waitForTimeout(250);
    }
  }
  return done().catch(() => false);
}

/** Answer the "a + b" Security Verification card (field is readOnly until focused). */
export async function fillMathCaptcha(page, inputId = 'login-captcha') {
  const box = page.locator(`#${inputId}`);
  await box.waitFor({ state: 'visible', timeout: 20_000 });
  await box.click().catch(() => {});
  await page
    .waitForFunction((id) => {
      const el = document.getElementById(id);
      return Boolean(el && !el.readOnly && !el.disabled);
    }, inputId, { timeout: 15_000 })
    .catch(() => {});
  const answer = await page.evaluate(() => {
    const text = document.querySelector('.ip-gemini-security__badge')?.textContent || '';
    const m = text.match(/(\d+)\s*\+\s*(\d+)/);
    return m ? String(Number(m[1]) + Number(m[2])) : '';
  });
  if (!answer) throw new Error('Could not read the captcha question on the page');
  await box.focus();
  await box.press('Control+A').catch(() => {});
  await box.pressSequentially(answer, { delay: 20 });
}
