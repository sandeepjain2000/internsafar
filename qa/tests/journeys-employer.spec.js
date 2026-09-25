const { test, expect } = require('@playwright/test');
const { employer } = require('../helpers/accounts');
const { openWithSession } = require('../helpers/login');

/**
 * Employer product journeys (behavior asserts).
 * Excel: TC-IS-09-015, TC-IS-09-016, TC-IS-09-017 (Action center also IS-063).
 */
test.describe('InternSafar journeys — employer', () => {
  test('JOURNEY-EMP-01 profile required asterisks + Action center', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer/profile');
    await expect(page).toHaveURL(/\/employer\/profile/, { timeout: 25_000 });

    await expect(page.getByRole('tab', { name: /Company Details/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Company \/ legal name/i).first()).toBeVisible();

    // Required markers span tabs — count Company + Contact & Location.
    const companyStars = await page.locator('span.ip-ep-req').count();
    await page.getByRole('tab', { name: /Contact & Location/i }).click();
    await expect(page.getByText(/Work Email/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/HQ City/i).first()).toBeVisible();
    const contactStars = await page.locator('span.ip-ep-req').count();
    expect(
      companyStars + contactStars,
      'expected multiple required asterisks across employer profile tabs',
    ).toBeGreaterThanOrEqual(6);

    await page.goto('/employer', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/employer\/?$/, { timeout: 25_000 });
    const center = page.locator('[data-testid="employer-action-center"]');
    await expect(center).toBeVisible({ timeout: 30_000 });
    await expect(center.getByText(/Action required/i).first()).toBeVisible();
  });

  test('JOURNEY-EMP-02 postings list loads with create affordance', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer/internships');
    await expect(page).toHaveURL(/\/employer\/internships/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 20_000 });
    // New posting entry (link or button)
    const newPost = page.getByRole('link', { name: /new|create|post internship/i }).first();
    const newBtn = page.getByRole('button', { name: /new|create|post internship/i }).first();
    const hasLink = (await newPost.count()) > 0;
    const hasBtn = (await newBtn.count()) > 0;
    expect(hasLink || hasBtn || (await page.locator('a[href*="/employer/internships/new"]').count()) > 0).toBeTruthy();
  });

  test('JOURNEY-EMP-03 new posting has State and City location fields', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer/internships/new');
    await expect(page).toHaveURL(/\/employer\/internships\/new/, { timeout: 25_000 });
    await expect(page.getByLabel('Work state')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('State', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('City', { exact: true }).first()).toBeVisible();
  });
});
