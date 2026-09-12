const { test, expect } = require('@playwright/test');

/**
 * Real Google OAuth start checks (not mocked).
 * Completing Google consent still needs a human account; this proves the app
 * reaches accounts.google.com with a host-matching redirect_uri.
 */
test.describe('InternSafar Google Auth', () => {
  test('home Sign in with Google reaches Google OAuth with matching redirect_uri', async ({
    page,
    baseURL,
  }) => {
    await page.goto('/');
    const googleBtn = page.locator('button.ip-gemini-google-btn');
    await expect(googleBtn).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('#email')).toBeVisible();

    await googleBtn.click();
    await page.waitForURL(/accounts\.google\.com/i, { timeout: 45_000 });

    const url = new URL(page.url());
    expect(url.searchParams.get('client_id')).toBeTruthy();
    const redirectUri = url.searchParams.get('redirect_uri') || '';
    expect(redirectUri).toMatch(/\/api\/auth\/callback\/google$/);
    expect(new URL(redirectUri).origin).toBe(new URL(baseURL).origin);
  });

  test('candidate register Google button is present', async ({ page }) => {
    await page.goto('/register/candidate');
    await expect(
      page.locator('button.ip-crg-google-btn, button:has-text("Google")').first(),
    ).toBeVisible({ timeout: 45_000 });
  });

  test('GoogleAccountNotLinked error renders friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleAccountNotLinked');
    await expect(page.getByText(/No InternSafar account is linked|Sign up with Google/i)).toBeVisible({
      timeout: 45_000,
    });
  });
});
