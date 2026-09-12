/**
 * Browser-level Google Auth verification (hydration + click → Google).
 * Usage: node scripts/verify-google-auth-browser.mjs [baseUrl ...]
 */
import { chromium } from '@playwright/test';

const hosts = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'http://localhost:3000',
      'https://internship-portal-sigma-mauve.vercel.app',
      'https://internsafar.com',
    ];

async function checkHost(browser, base) {
  const result = {
    base,
    ok: false,
    failures: [],
    warnings: [],
    checks: {},
  };
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err.message || err)));

  try {
    await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60_000 });
    result.checks.homeTitle = await page.title();

    // Must leave Loading fallback
    const googleBtn = page.locator('button.ip-gemini-google-btn, button:has-text("Sign in with Google")');
    try {
      await googleBtn.first().waitFor({ state: 'visible', timeout: 45_000 });
      result.checks.googleButtonVisible = true;
    } catch {
      result.checks.googleButtonVisible = false;
      result.failures.push('Google sign-in button never became visible (stuck on Loading or missing)');
    }

    const emailVisible = await page.locator('#email').isVisible().catch(() => false);
    result.checks.emailFieldVisible = emailVisible;
    if (!emailVisible) result.failures.push('Email field not visible after hydration');

    // Still showing only Loading?
    const bodyText = await page.locator('body').innerText();
    result.checks.bodyLooksStuckLoading =
      /^\s*Loading/i.test(bodyText.trim()) ||
      (bodyText.includes('Loading') && !bodyText.includes('Sign in') && !emailVisible);
    if (result.checks.bodyLooksStuckLoading) {
      result.failures.push('Page appears stuck on Loading after networkidle');
    }

    // Click Google → must reach accounts.google.com (real OAuth, not fake)
    if (result.checks.googleButtonVisible) {
      const [popupOrNav] = await Promise.all([
        page.waitForURL(/accounts\.google\.com/i, { timeout: 45_000 }).catch(() => null),
        googleBtn.first().click(),
      ]);
      const url = page.url();
      result.checks.afterGoogleClickUrl = url;
      const onGoogle = /accounts\.google\.com/i.test(url);
      result.checks.reachedGoogleAccounts = onGoogle;
      if (!onGoogle) {
        result.failures.push(`After Google click, URL was not Google accounts: ${url}`);
      } else {
        const u = new URL(url);
        const redirectUri = u.searchParams.get('redirect_uri') || '';
        const clientId = u.searchParams.get('client_id') || '';
        result.checks.oauthClientIdPresent = Boolean(clientId);
        result.checks.oauthRedirectUri = redirectUri;
        try {
          result.checks.redirectMatchesHost =
            new URL(redirectUri).origin === new URL(base).origin;
        } catch {
          result.checks.redirectMatchesHost = false;
        }
        if (!clientId) result.failures.push('Google URL missing client_id');
        if (!result.checks.redirectMatchesHost) {
          result.failures.push(`redirect_uri mismatch: ${redirectUri} vs ${base}`);
        }
      }
      void popupOrNav;
    }

    // Register candidate Google path: intent + button
    await page.goto(base + '/register/candidate', { waitUntil: 'networkidle', timeout: 60_000 });
    const regGoogle = page.locator(
      'button.ip-crg-google-btn, button:has-text("Google"), button:has-text("Continue with Google"), button:has-text("Sign up with Google")',
    );
    try {
      await regGoogle.first().waitFor({ state: 'visible', timeout: 45_000 });
      result.checks.registerGoogleVisible = true;
    } catch {
      result.checks.registerGoogleVisible = false;
      result.warnings.push('Register candidate Google button not found (copy/selector may differ)');
    }

    // Error query must show friendly message (no crash)
    await page.goto(base + '/?error=GoogleAccountNotLinked', {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForTimeout(1500);
    const errText = await page.locator('body').innerText();
    result.checks.errorMessageShown = /linked|Sign up with Google|No InternSafar account/i.test(
      errText,
    );
    if (!result.checks.errorMessageShown) {
      result.warnings.push('GoogleAccountNotLinked error text not clearly visible');
    }

    result.checks.consoleErrors = consoleErrors.slice(0, 12);
    result.checks.pageErrors = pageErrors.slice(0, 12);
    const crashLike = [...pageErrors, ...consoleErrors].filter((t) =>
      /hydration|TypeError|ReferenceError|CLIENT_FETCH_ERROR|Unhandled|crash/i.test(t),
    );
    result.checks.crashLikeErrors = crashLike;
    if (pageErrors.length) {
      result.failures.push(`pageerror: ${pageErrors[0]}`);
    }
    if (crashLike.length) {
      result.failures.push(`crash-like console: ${crashLike[0]}`);
    }
  } catch (e) {
    result.failures.push(`exception: ${e.message}`);
  } finally {
    await page.close();
  }

  result.ok = result.failures.length === 0;
  return result;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const host of hosts) {
  results.push(await checkHost(browser, host.replace(/\/$/, '')));
}
await browser.close();

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
