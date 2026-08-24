const { test, expect } = require('@playwright/test');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { signInOnHome, signInSuperAdmin, signOut, fillCaptchaIfPresent } = require('../helpers/login');

test.describe('InternSafar authentication', () => {
    test('home shows InternSafar email and password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-email')).toHaveCount(0);
  });

  test('/login redirects to home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('/login keeps query on home', async ({ page }) => {
    await page.goto(`/login?email=${encodeURIComponent(candidate.email)}&next=/candidate`);
    await expect(page).toHaveURL(/email=/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('candidate signs in on home and lands on /candidate', async ({ page }) => {
    await signInOnHome(page, candidate.email);
    await expect(page).toHaveURL(candidate.home, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
    await signOut(page);
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  });

  test('employer signs in on home and lands on /employer', async ({ page }) => {
    await signInOnHome(page, employer.email);
    await expect(page).toHaveURL(employer.home, { timeout: 25_000 });
    await signOut(page);
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  });

  test('superadmin signs in on /superadmin/login', async ({ page }) => {
    await signInSuperAdmin(page, superadmin.email);
    await expect(page).toHaveURL(superadmin.home, { timeout: 25_000 });
    await signOut(page);
    await expect(page).toHaveURL(/\/superadmin\/login/, { timeout: 15_000 });
  });

  test('wrong password stays signed out', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill(candidate.email);
    await page.locator('#password').fill('WrongPass!1');
    await fillCaptchaIfPresent(page);
    await page.locator('button.ip-gemini-submit[type="submit"]').click();
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/\/candidate/);
  });

  test('guest /candidate is gated to sign-in', async ({ page }) => {
    await page.goto('/candidate');
    await expect(page).toHaveURL(/\/(\?|$)|login/i, { timeout: 20_000 });
    await expect(page.locator('#email, #sa-email')).toBeVisible();
  });

  test('candidate cannot stay on /employer', async ({ page }) => {
    await signInOnHome(page, candidate.email);
    await expect(page).toHaveURL(candidate.home, { timeout: 25_000 });
    await page.goto('/employer');
    await expect(page).not.toHaveURL(/\/employer(\/|$)/, { timeout: 20_000 });
  });
});
