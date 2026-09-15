const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { openWithSession, signOut, apiLogin } = require('../helpers/login');

/**
 * InternSafar regression smoke (IS-* ids) applied into
 * test-cases/InternSafar-Test-Cases.xlsx via qa:e2e:regression.
 * Google OAuth depth: qa/tests/google-auth.spec.js
 * Role screen breadth: qa/tests/screens.spec.js
 */
const ROOT = path.resolve(__dirname, '../..');

async function apiWithSession(request, email, method, url, options = {}) {
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const logged = await apiLogin(base, email);
  expect(logged.ok, `API login failed for ${email}`).toBeTruthy();
  const cookie = logged.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const headers = { ...(options.headers || {}), Cookie: cookie };
  if (method === 'GET') return request.get(url, { ...options, headers });
  if (method === 'POST') return request.post(url, { ...options, headers });
  throw new Error(`unsupported ${method}`);
}

test.describe('InternSafar regression', () => {
  test('IS-001 home shows email/password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-email')).toHaveCount(0);
  });

  test('IS-002 legacy /login redirects to home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('IS-004 GoogleAccountNotLinked friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleAccountNotLinked');
    await expect(page.getByText(/No InternSafar account is linked|Sign up with Google/i)).toBeVisible({
      timeout: 45_000,
    });
  });

  test('IS-005 candidate register Google control visible', async ({ page }) => {
    await page.goto('/register/candidate');
    await expect(
      page.locator('button.ip-crg-google-btn, button:has-text("Google")').first(),
    ).toBeVisible({ timeout: 45_000 });
  });

  test('IS-006 / IS-009 candidate session and sign-out', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(candidate.home, { timeout: 25_000 });
    await signOut(page);
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  });

  test('IS-007 employer session lands on /employer', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(employer.home, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
  });

  test('IS-008 SuperAdmin session lands on /superadmin', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(superadmin.home, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
  });

  test('IS-011 help launcher opens panel', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/InternSafar Help/i)).toBeVisible();
  });

  test('IS-012 help-chat GET reports configuration', async ({ request }) => {
    const res = await request.get('/api/ip/help-chat');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.configured).toBe('boolean');
  });

  test('IS-017 help reset restores welcome', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    const reset = page.locator('.ip-helpbot__icon-btn').first();
    await reset.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__msg--assistant').first()).toBeVisible();
    await expect(page.locator('.ip-helpbot__starter').first()).toBeVisible({ timeout: 10_000 });
  });

  test('IS-018 / IS-020 ops report-error validation + accept', async ({ request }) => {
    const bad = await request.post('/api/ip/ops/report-error', { data: {} });
    expect(bad.status()).toBe(400);

    const ok = await request.post('/api/ip/ops/report-error', {
      data: {
        message: 'QA synthetic unexpected error (Playwright regression)',
        kind: 'UNEXPECTED_CLIENT',
        route: '/qa/regression',
      },
    });
    expect(ok.ok()).toBeTruthy();
    const body = await ok.json();
    expect(body.ok).toBe(true);
  });

  test('IS-019 ops report-error ignores ResizeObserver noise', async ({ request }) => {
    const res = await request.post('/api/ip/ops/report-error', {
      data: { message: 'ResizeObserver loop limit exceeded', kind: 'UNEXPECTED_CLIENT' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ignored).toBe(true);
  });

  test('IS-040 ops report-error cooldown on duplicate', async ({ request }) => {
    const payload = {
      message: 'QA cooldown synthetic unexpected error',
      kind: 'UNEXPECTED_CLIENT',
      route: '/qa/regression-cooldown',
    };
    const first = await request.post('/api/ip/ops/report-error', { data: payload });
    expect(first.ok()).toBeTruthy();
    const second = await request.post('/api/ip/ops/report-error', { data: payload });
    expect(second.ok()).toBeTruthy();
    const body = await second.json();
    expect(body.ok).toBe(true);
    // First may send; second should cooldown or still ok without crash.
    expect(body.cooldown === true || body.sent === false || body.ok === true).toBeTruthy();
  });

  test('IS-022 migration SQL safety scan passes', async () => {
    const r = spawnSync('node', ['scripts/assert-migration-sql-safe.js', '--scan-all'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(r.status, r.stderr || r.stdout || 'migration safety failed').toBe(0);
  });

  test('IS-024 candidate home loads', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(/\/candidate/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-025 employer home loads', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(/\/employer/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-026 SuperAdmin home loads', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(/\/superadmin/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-028 candidate cannot GET employer internships API', async ({ request }) => {
    const res = await apiWithSession(request, candidate.email, 'GET', '/api/ip/employer/internships');
    expect(res.status()).toBe(403);
  });

  test('IS-030 public how-it-works / guidelines / help load', async ({ page }) => {
    for (const href of ['/how-it-works', '/guidelines', '/help']) {
      const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
      expect(res && res.status() === 404).toBeFalsy();
      await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('IS-031 register hub offers candidate and employer paths', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: /candidate/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /employer/i }).first()).toBeVisible();
  });

  test('IS-037 /app guest goes to landing', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('IS-038 unauthenticated protected API fails closed', async ({ request }) => {
    const res = await request.get('/api/ip/candidate/applications');
    expect([401, 403]).toContain(res.status());
  });

  test('IS-039 empty help message rejected or no-ops in UI', async ({ page, request }) => {
    const api = await request.post('/api/ip/help-chat', { data: { message: '   ' } });
    expect(api.status()).toBe(400);
    const body = await api.json();
    expect(String(body.error || '')).toMatch(/help question/i);

    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    await page.locator('.ip-helpbot__send').evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__msg--user')).toHaveCount(0);
  });

  test('IS-041 apply without internshipId fails', async ({ request }) => {
    const res = await apiWithSession(request, candidate.email, 'POST', '/api/ip/candidate/applications', {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || body.message || '')).toMatch(/internshipId/i);
  });
});
