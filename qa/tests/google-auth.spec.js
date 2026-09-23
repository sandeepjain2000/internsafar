const { test, expect } = require('@playwright/test');

/**
 * Google OAuth checks (current product):
 * - Home login is email/password only (no Google button).
 * - Google without a register intent → GoogleLoginDisabled.
 * - Candidate register "Sign up with Google" starts real OAuth with host-matching redirect_uri.
 * Completing Google consent still needs a human account.
 */
test.describe('InternSafar Google Auth', () => {
  test('home has email/password login and no Google sign-in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button.ip-gemini-google-btn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sign in with google/i })).toHaveCount(0);
  });

  test('GoogleLoginDisabled error renders friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleLoginDisabled');
    await expect(page.getByText(/Google sign-in is not available/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('GoogleAccountNotLinked error renders friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleAccountNotLinked');
    await expect(page.getByText(/Google sign-in is not available/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('candidate register Google reaches Google OAuth with matching redirect_uri', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/register/candidate');
    const googleBtn = page.locator('button.ip-crg-google-btn').first();
    await expect(googleBtn).toBeVisible({ timeout: 45_000 });
    await expect(googleBtn).toContainText(/Sign up with Google|Opening Google/i);

    await googleBtn.click();
    await page.waitForURL(/accounts\.google\.com/i, { timeout: 45_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get('client_id')).toBeTruthy();
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    expect(redirectUri).toMatch(/\/api\/auth\/callback\/google$/);
    expect(new URL(redirectUri).origin).toBe(new URL(baseURL).origin);
  });
});
