const { test, expect } = require('@playwright/test');
const { candidate } = require('../helpers/accounts');
const { openWithSession, apiLogin } = require('../helpers/login');

/**
 * Candidate product journeys (behavior, not route-load only).
 * Excel: TC-IS-07-022, TC-IS-07-023, TC-IS-06-010 + apply path.
 */
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

test.describe('InternSafar journeys — candidate', () => {
  test('JOURNEY-CAND-01 browse list → open detail → Report control', async ({ page, request }) => {
    const listRes = await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/internships');
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const firstId = listBody?.items?.[0]?.id;
    test.skip(!firstId, 'No visible internships for candidate in this environment');

    await openWithSession(page, candidate.email, '/candidate/internships');
    await expect(page).toHaveURL(/\/candidate\/internships/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"], .ip-br').first()).toBeVisible({ timeout: 20_000 });

    // Re-establish session on detail (same pattern as IS-061) to avoid stale shell races
    await openWithSession(page, candidate.email, `/candidate/internships/${firstId}`);
    await expect(page).toHaveURL(new RegExp(`/candidate/internships/${firstId}`), { timeout: 20_000 });
    await expect(page.locator('main, [role="main"], .ip-id').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Report$/i }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      page.getByRole('button', { name: /Apply|Applied|Applying/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('JOURNEY-CAND-02 profile Save draft + browse start-date filter', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/profile');
    await expect(page.getByRole('button', { name: /Save draft/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto('/candidate/internships', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/candidate\/internships/, { timeout: 25_000 });
    await page.locator('button.ip-br-btn').filter({ hasText: /Filter/i }).first().click();
    await expect(page.locator('.ip-br-drawer')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.ip-br-drawer label').filter({ hasText: /Start date/i })).toBeVisible();
  });
});
