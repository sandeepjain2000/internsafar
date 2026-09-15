/**
 * Latest-update InternSafar cases → byTcId for InternSafar-Test-Cases.xlsx apply.
 * Maps to TC-IS-02-024..026 and TC-IS-18-039..046 (see patch-internsafar-latest-cases.py).
 */
import './ensurePlaywrightBrowsers.mjs'; // pin PLAYWRIGHT_BROWSERS_PATH before launch
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QA_ACCOUNTS, apiLogin, apiRequest } from './ipQaAuth.mjs';


const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

/**
 * @param {{
 *   BASE: string,
 *   assess: (id: string, ok: boolean, actual: unknown) => void,
 *   pass?: (id: string, actual: unknown) => void,
 *   fail?: (id: string, actual: unknown) => void,
 *   blocked?: (id: string, actual: unknown) => void,
 * }} ctx
 */
export async function runLatestUpdateTcIsCases(ctx) {
  const { BASE, assess, blocked = () => {} } = ctx;

  // TC-IS-18-040 help-chat config
  const helpGet = await apiRequest(BASE, '/api/ip/help-chat', { method: 'GET' });
  assess(
    'TC-IS-18-040',
    helpGet.status === 200 && helpGet.data?.ok === true && typeof helpGet.data?.configured === 'boolean',
    { status: helpGet.status, configured: helpGet.data?.configured },
  );

  // TC-IS-18-041 empty help
  const helpEmpty = await apiRequest(BASE, '/api/ip/help-chat', {
    method: 'POST',
    body: { message: '   ' },
  });
  assess(
    'TC-IS-18-041',
    helpEmpty.status === 400,
    { status: helpEmpty.status, error: helpEmpty.data?.error },
  );

  // TC-IS-18-042 / 043 / 044 ops alerts
  const opsBad = await apiRequest(BASE, '/api/ip/ops/report-error', { method: 'POST', body: {} });
  const opsOk = await apiRequest(BASE, '/api/ip/ops/report-error', {
    method: 'POST',
    body: {
      message: 'QA synthetic unexpected error (run-internsafar-qa)',
      kind: 'UNEXPECTED_CLIENT',
      route: '/qa/latest-update',
    },
  });
  assess(
    'TC-IS-18-042',
    opsBad.status === 400 && opsOk.status === 200 && opsOk.data?.ok === true,
    { bad: opsBad.status, ok: opsOk.status, body: opsOk.data },
  );

  const opsIgnore = await apiRequest(BASE, '/api/ip/ops/report-error', {
    method: 'POST',
    body: { message: 'ResizeObserver loop limit exceeded', kind: 'UNEXPECTED_CLIENT' },
  });
  assess(
    'TC-IS-18-043',
    opsIgnore.status === 200 && opsIgnore.data?.ignored === true,
    opsIgnore.data,
  );

  const opsDupPayload = {
    message: 'QA cooldown synthetic unexpected error',
    kind: 'UNEXPECTED_CLIENT',
    route: '/qa/latest-update-cooldown',
  };
  const ops1 = await apiRequest(BASE, '/api/ip/ops/report-error', {
    method: 'POST',
    body: opsDupPayload,
  });
  const ops2 = await apiRequest(BASE, '/api/ip/ops/report-error', {
    method: 'POST',
    body: opsDupPayload,
  });
  assess(
    'TC-IS-18-044',
    ops1.status === 200 && ops2.status === 200 && ops2.data?.ok === true,
    { first: ops1.data, second: ops2.data },
  );

  // TC-IS-18-045 migration safety
  const mig = spawnSync('node', ['scripts/assert-migration-sql-safe.js', '--scan-all'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assess('TC-IS-18-045', mig.status === 0, {
    status: mig.status,
    out: String(mig.stdout || mig.stderr || '').slice(0, 400),
  });

  // TC-IS-02-026 credentials still work
  const cand = await apiLogin(BASE, QA_ACCOUNTS.candidate.email, QA_ACCOUNTS.candidate.password);
  assess('TC-IS-02-026', cand.ok === true, { email: QA_ACCOUNTS.candidate.email, ok: cand.ok });

  // TC-IS-02-027: manual Pass recorded in Excel — skipped here so apply does not re-Block.

  // Browser: Google OAuth start, linked error, help UI
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const googleBtn = page.locator('button.ip-gemini-google-btn');
    const googleVisible = await googleBtn.isVisible({ timeout: 20_000 }).catch(() => false);
    if (!googleVisible) {
      assess('TC-IS-02-024', false, 'Google button not visible (GOOGLE_* missing?)');
      assess('TC-IS-18-030', false, 'Google button not visible on home');
    } else {
      try {
        await googleBtn.click();
        await page.waitForURL(/accounts\.google\.com/i, { timeout: 60_000 });
        const url = new URL(page.url());
        const redirectUri = url.searchParams.get('redirect_uri') || '';
        const originOk = (() => {
          try {
            return new URL(redirectUri).origin === new URL(BASE).origin;
          } catch {
            return false;
          }
        })();
        const googleStartOk =
          Boolean(url.searchParams.get('client_id')) &&
          /\/api\/auth\/callback\/google$/.test(redirectUri) &&
          originOk;
        assess('TC-IS-02-024', googleStartOk, {
          client_id: Boolean(url.searchParams.get('client_id')),
          redirectUri,
        });
        assess('TC-IS-18-030', googleStartOk && cand.ok, {
          googleStart: googleStartOk,
          credentialsOk: cand.ok,
        });
      } catch (e) {
        // Do not abort the rest of latest-update cases (help/ops) on Google timing flakes.
        const msg = e?.message || String(e);
        assess('TC-IS-02-024', false, { error: msg.slice(0, 240), url: page.url() });
        assess('TC-IS-18-030', false, { error: msg.slice(0, 240), credentialsOk: cand.ok });
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
      }
    }

    await page.goto(`${BASE}/?error=GoogleAccountNotLinked`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const friendly = await page
      .getByText(/No InternSafar account is linked|Sign up with Google/i)
      .first()
      .isVisible({ timeout: 20_000 })
      .catch(() => false);
    assess('TC-IS-02-025', friendly, { url: page.url() });
    // TC-IS-03-021: unlinked no-intent path surfaces GoogleAccountNotLinked (full live consent still manual)
    assess('TC-IS-03-021', friendly, {
      url: page.url(),
      note: 'Automated friendly error UX; completing live Google consent with unlinked account remains manual.',
    });

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const launcher = page.locator('.ip-helpbot__launcher');
    await launcher.waitFor({ state: 'visible', timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    const panel = await page.locator('.ip-helpbot__panel').isVisible({ timeout: 15_000 }).catch(() => false);
    const title = await page.getByText(/InternSafar Help/i).isVisible().catch(() => false);
    assess('TC-IS-18-039', panel && title, { panel, title });

    if (panel) {
      const reset = page.locator('.ip-helpbot__icon-btn').first();
      await reset.evaluate((el) => el.click()).catch(() => {});
      const starters = await page
        .locator('.ip-helpbot__starter')
        .first()
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      assess('TC-IS-18-046', starters, { starters });
    } else {
      assess('TC-IS-18-046', false, 'help panel did not open');
    }
  } finally {
    await browser.close();
  }
}
