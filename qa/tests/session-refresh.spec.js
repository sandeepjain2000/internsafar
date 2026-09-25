const { test, expect } = require('@playwright/test');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { openWithSession } = require('../helpers/login');

/**
 * Session/refresh sanity across roles (tester note: refresh behavior differed by role).
 * Confirms JWT session survives reload on the role home.
 */
test.describe('InternSafar session refresh', () => {
  test('candidate stays on /candidate after reload', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(/\/candidate/, { timeout: 25_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/candidate/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"], h1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('employer stays on /employer after reload', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(/\/employer\/?$/, { timeout: 25_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/employer\/?$/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"], h1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('superadmin stays on /superadmin after reload', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(/\/superadmin\/?$/, { timeout: 25_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/superadmin\/?$/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"], h1').first()).toBeVisible({ timeout: 20_000 });
  });

  test('candidate cannot keep /employer after reload (role gate)', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await page.goto('/employer', { waitUntil: 'domcontentloaded' });
    // Wrong-role shell should bounce off employer workspace
    await expect(page).not.toHaveURL(/\/employer\/?$/, { timeout: 25_000 });
  });
});
