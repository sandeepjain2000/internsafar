const { test, expect } = require('@playwright/test');
const { candidate } = require('../helpers/accounts');
const { openWithSession } = require('../helpers/login');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile /candidate/internships', async ({ page }) => {
  await openWithSession(page, candidate.email, '/candidate/internships');
  await expect(page).toHaveURL(/\/candidate\/internships/);
  await expect(page.locator('main')).toBeVisible({ timeout: 25_000 });
  await page.locator('text=Loading internships').waitFor({ state: 'hidden', timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: 'test-results/mobile-candidate-internships.png',
    fullPage: true,
  });
});
