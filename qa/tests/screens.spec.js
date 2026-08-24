const { test, expect } = require('@playwright/test');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { openWithSession, assertNoCrash } = require('../helpers/login');
const { PUBLIC, CANDIDATE, EMPLOYER, SUPERADMIN } = require('../routes-by-role');

async function smoke(page, href) {
  const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
  expect(res && res.status() === 404).toBeFalsy();
  const body = await page.locator('body').innerText({ timeout: 15_000 });
  assertNoCrash(body);
}

test.describe('InternSafar public screens', () => {
  for (const route of PUBLIC) {
    test(`${route.label} ${route.href}`, async ({ page }) => {
      await smoke(page, route.href);
    });
  }
});

test.describe('InternSafar candidate screens', () => {
  test.beforeEach(async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(/\/candidate/, { timeout: 20_000 });
  });

  for (const route of CANDIDATE) {
    test(`${route.label} ${route.href}`, async ({ page }) => {
      await smoke(page, route.href);
    });
  }
});

test.describe('InternSafar employer screens', () => {
  test.beforeEach(async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(/\/employer/, { timeout: 20_000 });
  });

  for (const route of EMPLOYER) {
    test(`${route.label} ${route.href}`, async ({ page }) => {
      await smoke(page, route.href);
    });
  }
});

test.describe('InternSafar SuperAdmin screens', () => {
  test.beforeEach(async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(/\/superadmin/, { timeout: 20_000 });
  });

  for (const route of SUPERADMIN) {
    test(`${route.label} ${route.href}`, async ({ page }) => {
      await smoke(page, route.href);
    });
  }
});
