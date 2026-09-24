const { test, expect } = require('@playwright/test');
const { superadmin } = require('../helpers/accounts');
const { openWithSession, apiLogin } = require('../helpers/login');

/**
 * SuperAdmin product journeys.
 * Excel: TC-IS-14-023 — re-apply same status skips notify (changed=false / skipped++).
 */
async function apiWithSession(request, email, method, url, options = {}) {
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const logged = await apiLogin(base, email);
  expect(logged.ok, `API login failed for ${email}`).toBeTruthy();
  const cookie = logged.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const headers = { ...(options.headers || {}), Cookie: cookie };
  if (method === 'GET') return request.get(url, { ...options, headers });
  if (method === 'POST') return request.post(url, { ...options, headers });
  if (method === 'PATCH') return request.patch(url, { ...options, headers });
  throw new Error(`unsupported ${method}`);
}

test.describe('InternSafar journeys — SuperAdmin', () => {
  test('JOURNEY-SA-01 postings page + same-status publish skips change', async ({ page, request }) => {
    await openWithSession(page, superadmin.email, '/superadmin/postings');
    await expect(page).toHaveURL(/\/superadmin\/postings/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible({ timeout: 20_000 });

    const listRes = await apiWithSession(request, superadmin.email, 'GET', '/api/ip/superadmin/postings?meta=1');
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const items = listBody?.items || listBody?.postings || listBody?.rows || [];
    const published = items.find((i) => String(i.status || i.display_status || '') === 'published');
    test.skip(!published?.id, 'No published posting available for skip-notify assert');

    const patch = await apiWithSession(request, superadmin.email, 'PATCH', '/api/ip/superadmin/postings', {
      data: { id: published.id, status: 'published' },
    });
    expect(patch.ok()).toBeTruthy();
    const body = await patch.json();
    expect(body.ok).toBe(true);
    expect(body.skipped, `expected skipped>=1 when re-publishing ${published.id}`).toBeGreaterThanOrEqual(1);
    expect(body.changed === 0 || body.skipped >= 1).toBeTruthy();
  });
});
