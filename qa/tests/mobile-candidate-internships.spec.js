const { test, expect } = require('@playwright/test');
const { candidate } = require('../helpers/accounts');
const { openWithSession } = require('../helpers/login');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile /candidate/internships', async ({ page }) => {
  await openWithSession(page, candidate.email, '/candidate/internships');
  await expect(page).toHaveURL(/\/candidate\/internships/);
  await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('heading', { name: /browse internships/i }).waitFor({
    state: 'visible',
    timeout: 30_000,
  });
  await page
    .locator('text=Loading internships')
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => {});
  await page.getByText(/opening|roles matching|saved views|all internships/i).first().waitFor({
    state: 'visible',
    timeout: 15_000,
  }).catch(() => {});
  await page.screenshot({
    path: 'test-results/mobile-candidate-internships.png',
    fullPage: true,
  });
});
