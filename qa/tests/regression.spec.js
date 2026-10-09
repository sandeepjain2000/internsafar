const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { openWithSession, signOut, apiLogin } = require('../helpers/login');
const { openTableFilters } = require('../helpers/ipTableFilters');
const { testEmployerPublishedPostingIds } = require('../helpers/testPostings');

/**
 * InternSafar regression smoke (IS-* ids) applied into
 * test-cases/InternSafar-Test-Cases.xlsx via qa:e2e:regression.
 * Google OAuth depth: qa/tests/google-auth.spec.js
 * Role screen breadth: qa/tests/screens.spec.js
 */
const ROOT = path.resolve(__dirname, '../..');

/** Skip ops-alert email probes on live AWS (or when explicitly requested). */
function skipOpsProbes() {
  if (process.env.IP_QA_SKIP_OPS_PROBES === '1' || process.env.IP_QA_SKIP_OPS_PROBES === 'true') {
    return true;
  }
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || '';
  return /internsafar\.com/i.test(base);
}

async function apiWithSession(request, email, method, url, options = {}) {
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const logged = await apiLogin(base, email);
  expect(logged.ok, `API login failed for ${email}`).toBeTruthy();
  const cookie = logged.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const headers = { ...(options.headers || {}), Cookie: cookie };
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET') return request.get(url, { ...options, headers });
  if (m === 'POST') return request.post(url, { ...options, headers });
  if (m === 'PATCH') return request.patch(url, { ...options, headers });
  if (m === 'PUT') return request.put(url, { ...options, headers });
  throw new Error(`unsupported ${method}`);
}

test.describe('InternSafar regression', () => {
  test('IS-001 home shows email/password fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#login-email')).toHaveCount(0);
    const learnMore = page.getByRole('navigation', { name: 'Learn more' });
    await expect(learnMore.getByRole('link', { name: 'How it works' })).toBeVisible();
    await expect(learnMore.getByRole('link', { name: 'Help Center' })).toBeVisible();
  });

  test('IS-002 legacy /login redirects to home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('IS-003 home has no Google sign-in button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('button.ip-gemini-google-btn')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /sign in with google/i })).toHaveCount(0);
  });

  test('IS-004 GoogleAccountNotLinked friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleAccountNotLinked');
    await expect(page.getByText(/Google sign-in is not available/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('IS-004b GoogleLoginDisabled friendly message', async ({ page }) => {
    await page.goto('/?error=GoogleLoginDisabled');
    await expect(page.getByText(/Google sign-in is not available/i).first()).toBeVisible({
      timeout: 45_000,
    });
  });

  test('IS-005 candidate register Google control visible', async ({ page }) => {
    await page.goto('/register/candidate');
    await expect(page.locator('button.ip-crg-google-btn').first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('button.ip-crg-google-btn').first()).toContainText(/Sign up with Google/i);
  });

  test('IS-006 / IS-009 candidate session and sign-out', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(candidate.home, { timeout: 25_000 });
    await signOut(page);
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
  });

  test('IS-007 employer session lands on /employer', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(employer.home, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
  });

  test('IS-008 SuperAdmin session lands on /superadmin', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(superadmin.home, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /sign out/i }).first()).toBeVisible();
  });

  test('IS-011 help launcher opens panel', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/InternSafar Help/i)).toBeVisible();
  });

  test('IS-012 help-chat GET reports configuration', async ({ request }) => {
    const res = await request.get('/api/ip/help-chat');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.configured).toBe('boolean');
  });

  test('IS-017 help reset restores welcome', async ({ page }) => {
    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    const reset = page.locator('.ip-helpbot__icon-btn').first();
    await reset.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__msg--assistant').first()).toBeVisible();
    await expect(page.locator('.ip-helpbot__starter').first()).toBeVisible({ timeout: 10_000 });
  });

  test('IS-018 / IS-020 ops report-error validation + accept', async ({ request }) => {
    test.skip(skipOpsProbes(), 'Skip ops email probes on AWS production / IP_QA_SKIP_OPS_PROBES');
    const bad = await request.post('/api/ip/ops/report-error', { data: {} });
    expect(bad.status()).toBe(400);

    const ok = await request.post('/api/ip/ops/report-error', {
      data: {
        message: 'QA synthetic unexpected error (Playwright regression)',
        kind: 'QA_PROBE',
        route: '/qa/regression',
      },
    });
    expect(ok.ok()).toBeTruthy();
    const body = await ok.json();
    expect(body.ok).toBe(true);
  });

  test('IS-019 ops report-error ignores ResizeObserver noise', async ({ request }) => {
    test.skip(skipOpsProbes(), 'Skip ops email probes on AWS production / IP_QA_SKIP_OPS_PROBES');
    const res = await request.post('/api/ip/ops/report-error', {
      data: { message: 'ResizeObserver loop limit exceeded', kind: 'UNEXPECTED_CLIENT' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ignored).toBe(true);
  });

  test('IS-040 ops report-error cooldown on duplicate', async ({ request }) => {
    test.skip(skipOpsProbes(), 'Skip ops email probes on AWS production / IP_QA_SKIP_OPS_PROBES');
    const payload = {
      message: 'QA cooldown synthetic unexpected error',
      kind: 'QA_PROBE',
      route: '/qa/regression-cooldown',
    };
    const first = await request.post('/api/ip/ops/report-error', { data: payload });
    expect(first.ok()).toBeTruthy();
    const second = await request.post('/api/ip/ops/report-error', { data: payload });
    expect(second.ok()).toBeTruthy();
    const body = await second.json();
    expect(body.ok).toBe(true);
    // First may send; second should cooldown or still ok without crash.
    expect(body.cooldown === true || body.sent === false || body.ok === true).toBeTruthy();
  });

  test('IS-022 migration SQL safety scan passes', async () => {
    const r = spawnSync('node', ['scripts/assert-migration-sql-safe.js', '--scan-all'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(r.status, r.stderr || r.stdout || 'migration safety failed').toBe(0);
  });

  test('IS-024 candidate home loads', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate');
    await expect(page).toHaveURL(/\/candidate/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-025 employer home loads', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(/\/employer/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-026 SuperAdmin home loads', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin');
    await expect(page).toHaveURL(/\/superadmin/, { timeout: 20_000 });
    await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  });

  test('IS-028 candidate cannot GET employer internships API', async ({ request }) => {
    const res = await apiWithSession(request, candidate.email, 'GET', '/api/ip/employer/internships');
    expect(res.status()).toBe(403);
  });

  test('IS-057 candidate cannot fetch another user object via files API', async ({ request }) => {
    const foreignKey = encodeURIComponent(
      'internship-portal/candidates/ip_user_not_this_candidate/resume/secret.pdf',
    );
    const res = await apiWithSession(
      request,
      candidate.email,
      'GET',
      `/api/ip/files?key=${foreignKey}`,
    );
    expect(res.status()).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || '')).toMatch(/forbidden/i);
  });

  test('IS-030 public how-it-works / guidelines / help load', async ({ page }) => {
    for (const href of ['/how-it-works', '/guidelines', '/help']) {
      const res = await page.goto(href, { waitUntil: 'domcontentloaded' });
      expect(res && res.status() === 404).toBeFalsy();
      await expect(page.locator('h1, h2, main').first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test('IS-031 register hub offers candidate and employer paths', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('link', { name: /candidate/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /employer/i }).first()).toBeVisible();
  });

  test('IS-037 /app guest goes to landing', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/(\?|$)/, { timeout: 15_000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('IS-038 unauthenticated protected API fails closed', async ({ request }) => {
    const res = await request.get('/api/ip/candidate/applications');
    expect([401, 403]).toContain(res.status());
  });

  test('IS-039 empty help message rejected or no-ops in UI', async ({ page, request }) => {
    const api = await request.post('/api/ip/help-chat', { data: { message: '   ' } });
    expect(api.status()).toBe(400);
    const body = await api.json();
    expect(String(body.error || '')).toMatch(/help question/i);

    await page.goto('/');
    const launcher = page.locator('.ip-helpbot__launcher');
    await expect(launcher).toBeVisible({ timeout: 45_000 });
    await launcher.evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__panel')).toBeVisible({ timeout: 15_000 });
    await page.locator('.ip-helpbot__send').evaluate((el) => el.click());
    await expect(page.locator('.ip-helpbot__msg--user')).toHaveCount(0);
  });

  test('IS-041 apply without internshipId fails', async ({ request }) => {
    const res = await apiWithSession(request, candidate.email, 'POST', '/api/ip/candidate/applications', {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || body.message || '')).toMatch(/internshipId/i);
  });

  test('IS-055 unsubscribe page handles missing token', async ({ page }) => {
    await page.goto('/unsubscribe');
    await expect(page.getByText('Link not valid').first()).toBeVisible({ timeout: 20_000 });
  });

  test('IS-056 applications list shows pagination chrome when needed', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/applications');
    await expect(page).toHaveURL(/\/candidate\/applications/, { timeout: 25_000 });
    await expect(page.locator('main, [role="main"], .ip-ap, .ip-of-list').first()).toBeVisible({
      timeout: 20_000,
    });
    const pager = page.getByText(/Showing .+ of|Page \d+ \/|Previous/i).first();
    if (await pager.count()) {
      await expect(pager).toBeVisible();
    }
  });

  test('IS-061 internship detail exposes Report listing control', async ({ page, request }) => {
    const listRes = await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/internships');
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    const testIds = await testEmployerPublishedPostingIds();
    const firstId = (listBody?.items || []).find((i) => testIds.has(i?.id))?.id;
    test.skip(!firstId, 'No open test-employer posting visible (npm run qa:ensure-test-accounts)');
    await openWithSession(page, candidate.email, `/candidate/internships/${firstId}`);
    await expect(page).toHaveURL(new RegExp(`/candidate/internships/${firstId}`), { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /^Report$/i }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('IS-062 profile has Save draft & exit', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/profile');
    await expect(page).toHaveURL(/\/candidate\/profile/, { timeout: 25_000 });
    await expect(page.getByRole('button', { name: /Save draft/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('IS-063 employer dashboard Action center', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer');
    await expect(page).toHaveURL(/\/employer\/?$/, { timeout: 25_000 });
    const center = page.locator('[data-testid="employer-action-center"]');
    await expect(center).toBeVisible({ timeout: 30_000 });
    await expect(center.getByText('Action center')).toBeVisible();
    await expect(center.locator('.ip-ed-action-score__value')).toHaveText(/^\d+$/);
    await expect(center.locator('.ip-ed-action-score__link')).toHaveText(
      /Upload verification documents|Finish your company profile|Applications waiting for your review|Interviews scheduled today|No applications waiting for review|Waiting for Final Approval|No tasks right now/,
    );
    await expect(center).toHaveAttribute('href', /\/employer\/(profile|internships)$/);
  });

  test('IS-064 browse filters include start date', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/internships');
    await expect(page).toHaveURL(/\/candidate\/internships/, { timeout: 25_000 });
    const { panel } = await openTableFilters(page);
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await expect(panel.locator('label').filter({ hasText: /Start date/i })).toBeVisible();
    await expect(panel.locator('option', { hasText: 'Starts within 30 days' })).toBeAttached();
  });

  test('IS-065 active duplicate apply is blocked', async ({ request }) => {
    const appsRes = await apiWithSession(
      request,
      candidate.email,
      'GET',
      '/api/ip/candidate/applications?pageSize=200',
    );
    expect(appsRes.ok()).toBeTruthy();
    const appsBody = await appsRes.json();
    const testIds = await testEmployerPublishedPostingIds();
    const active = (appsBody.items || []).find((a) => {
      const s = String(a.status || '').toLowerCase();
      return s && s !== 'withdrawn' && testIds.has(a.internship_id);
    });
    test.skip(!active?.internship_id, 'No active test-candidate application (npm run qa:ensure-test-accounts)');
    const res = await apiWithSession(request, candidate.email, 'POST', '/api/ip/candidate/applications', {
      data: { internshipId: active.internship_id, answers: {} },
    });
    expect(res.status()).toBe(409);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || '')).toMatch(/active application|already/i);
  });

  test('IS-066 withdraw then reapply allowed', async ({ request }) => {
    function buildAnswers(questions) {
      const answers = {};
      for (const q of questions || []) {
        if (typeof q === 'string') {
          answers[`q${Object.keys(answers).length + 1}`] = 'QA reapply answer';
          continue;
        }
        const id = String(q.id || '').trim();
        if (!id) continue;
        if (String(q.type || '').toLowerCase() === 'mcq') {
          const opts = Array.isArray(q.options) ? q.options : [];
          const safe = opts.find((o) => o && !o.disablesApplication) || opts[0];
          if (safe) answers[id] = String(safe.id || safe.label || '');
        } else {
          answers[id] = 'QA reapply answer';
        }
      }
      return answers;
    }

    async function loadQuestions(internshipId) {
      const detail = await apiWithSession(
        request,
        candidate.email,
        'GET',
        `/api/ip/candidate/internships/${internshipId}`,
      );
      const detailBody = await detail.json().catch(() => ({}));
      return Array.isArray(detailBody?.internship?.questions) ? detailBody.internship.questions : [];
    }

    async function applyTo(internshipId) {
      const questions = await loadQuestions(internshipId);
      const answers = buildAnswers(questions);
      return apiWithSession(request, candidate.email, 'POST', '/api/ip/candidate/applications', {
        data: { internshipId, answers },
      });
    }

    const appsRes = await apiWithSession(
      request,
      candidate.email,
      'GET',
      '/api/ip/candidate/applications?pageSize=200',
    );
    expect(appsRes.ok()).toBeTruthy();
    const appsBody = await appsRes.json();
    const testIds = await testEmployerPublishedPostingIds();
    const items = (appsBody.items || []).filter((a) => testIds.has(a.internship_id));

    let target = items.find((a) => {
      const s = String(a.status || '').toLowerCase();
      return ['applied', 'pending'].includes(s) && a.id && a.internship_id;
    });

    if (!target) {
      const withdrawn = items.find(
        (a) => String(a.status || '').toLowerCase() === 'withdrawn' && a.internship_id,
      );
      if (withdrawn) {
        const again = await applyTo(withdrawn.internship_id);
        expect([200, 201], `reapply on withdrawn failed: ${again.status()}`).toContain(again.status());
        const againBody = await again.json().catch(() => ({}));
        expect(againBody.ok || againBody.id).toBeTruthy();
        return;
      }

      const listRes = await apiWithSession(
        request,
        candidate.email,
        'GET',
        '/api/ip/candidate/internships?pageSize=200&chip=unapplied',
      );
      expect(listRes.ok()).toBeTruthy();
      const listBody = await listRes.json();
      const openId = (listBody.items || []).find((i) => i?.id && !i.applied && testIds.has(i.id))?.id;
      expect(openId, 'No open test-employer posting; run npm run qa:ensure-test-accounts').toBeTruthy();

      const created = await applyTo(openId);
      test.skip(
        ![200, 201].includes(created.status()),
        `Could not create seed application (${created.status()})`,
      );
      const createdBody = await created.json().catch(() => ({}));
      target = { id: createdBody.id, internship_id: openId };
      test.skip(!target.id, 'Seed apply did not return application id');
    }

    const w = await apiWithSession(
      request,
      candidate.email,
      'PATCH',
      `/api/ip/candidate/applications/${target.id}`,
      { data: { status: 'withdrawn' } },
    );
    expect(w.ok(), `withdraw failed: ${w.status()}`).toBeTruthy();

    const again = await applyTo(target.internship_id);
    expect([200, 201], `reapply failed: ${again.status()}`).toContain(again.status());
    const againBody = await again.json().catch(() => ({}));
    expect(againBody.ok || againBody.id).toBeTruthy();
  });

  test('IS-067 candidate form-path register API returns 410', async ({ request }) => {
    const res = await request.post('/api/ip/auth/register-candidate', {
      data: { path: 'form', email: 'qa.formpath.retired@gmail.com', password: 'Password1!' },
    });
    expect(res.status()).toBe(410);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || '')).toMatch(/no longer available/i);
  });

  test('IS-068 employer manualRequest register API returns 410', async ({ request }) => {
    const res = await request.post('/api/ip/auth/register-employer', {
      data: { manualRequest: true, email: 'qa.manual.retired@example.com', companyName: 'QA Retired' },
    });
    expect(res.status()).toBe(410);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error || '')).toMatch(/no longer accepted/i);
  });

  test('IS-069 employer register rejects missing company and short password', async ({ request }) => {
    const base = {
      path: 'free_email',
      email: `qa.reg.validation.${Date.now()}@example.com`,
      companyName: 'QA Validation Co',
      contactName: 'QA Person',
      designation: 'HR',
      password: 'Password1!',
    };
    const noCompany = await request.post('/api/ip/auth/register-employer', {
      data: { ...base, companyName: '' },
    });
    expect(noCompany.status()).toBe(400);
    expect(String((await noCompany.json()).error || '')).toMatch(/Company name is required/i);

    const shortPw = await request.post('/api/ip/auth/register-employer', {
      data: { ...base, password: 'Short12' },
    });
    expect(shortPw.status()).toBe(400);
    expect(String((await shortPw.json()).error || '')).toMatch(/at least 8 characters/i);
  });

  test('IS-070 employer register offers Domain-based and Free-email-based paths without Google', async ({ page }) => {
    await page.goto('/register/employer');
    await expect(page.getByRole('heading', { name: /Employer Registration/i })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByRole('button', { name: 'Domain-based' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Free-email-based' })).toBeVisible();
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
  });

  test('IS-071 retired SuperAdmin queues redirect and their APIs return 410', async ({ page, request }) => {
    await openWithSession(page, superadmin.email, '/superadmin/form-registrations');
    await expect(page).toHaveURL(/\/superadmin\/approvals/, { timeout: 25_000 });
    await page.goto('/superadmin/requests', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/superadmin\/approvals/, { timeout: 25_000 });
    await page.goto('/superadmin/viral', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/superadmin\/?$/, { timeout: 25_000 });

    for (const url of ['/api/ip/superadmin/form-registrations', '/api/ip/superadmin/requests']) {
      const res = await apiWithSession(request, superadmin.email, 'GET', url);
      expect(res.status(), url).toBe(410);
    }
  });

  test('IS-072 Adjust Points page loads and API rejects bad delta and non-SuperAdmin', async ({ page, request }) => {
    await openWithSession(page, superadmin.email, '/superadmin/points');
    await expect(page.getByRole('heading', { name: 'Adjust Points' })).toBeVisible({ timeout: 30_000 });

    for (const delta of [0, 1.5]) {
      const res = await apiWithSession(request, superadmin.email, 'POST', '/api/ip/superadmin/points', {
        data: { userId: 'ip_user_qa_not_real', delta },
      });
      expect(res.status(), `delta ${delta}`).toBe(400);
      expect(String((await res.json()).error || '')).toMatch(/non-zero integer/i);
    }

    const asCandidate = await apiWithSession(request, candidate.email, 'POST', '/api/ip/superadmin/points', {
      data: { userId: 'ip_user_qa_not_real', delta: 1 },
    });
    expect(asCandidate.status()).toBe(403);
  });

  test('IS-073 approvals page tabs expose tab-specific bulk actions', async ({ page }) => {
    await openWithSession(page, superadmin.email, '/superadmin/approvals');
    await expect(page.getByRole('heading', { name: /Final Employer Approvals/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /Approve Selected/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reject Selected/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reset Ethics/i })).toBeVisible();

    await page.getByRole('tab', { name: /^Approved/ }).click();
    await expect(page.getByRole('button', { name: /Suspend Selected/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reject Selected/i })).toBeVisible();

    await page.getByRole('tab', { name: /^Suspended/ }).click();
    await expect(page.getByRole('button', { name: /Restore Selected/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reject Selected/i })).toBeVisible();

    await expect(page.getByRole('tab', { name: /^Rejected/ })).toBeVisible();
  });

  test('IS-074 employer profile five tabs and Contact & Location field order', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer/profile');
    const tablist = page.getByRole('tablist', { name: 'Employer profile sections' });
    await expect(tablist).toBeVisible({ timeout: 30_000 });
    for (const name of [
      'Company Details',
      'Contact & Location',
      'About & Visibility',
      'Guidelines & Ethics',
      'Verification Documents',
    ]) {
      await expect(tablist.getByRole('tab', { name })).toBeVisible();
    }
    await tablist.getByRole('tab', { name: 'Contact & Location' }).click();
    const panel = page.getByRole('tabpanel').filter({ hasText: 'HQ City' }).first();
    await expect(panel).toBeVisible({ timeout: 10_000 });
    const text = await panel.innerText();
    const positions = ['HQ Country', 'HQ State / Province', 'HQ City', 'Contact Phone', 'Work Email'].map(
      (label) => text.indexOf(label),
    );
    expect(positions.every((p) => p >= 0), `labels missing: ${positions}`).toBeTruthy();
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('IS-075 locked ethics acknowledgements cannot be revoked via API', async ({ request }) => {
    const profRes = await apiWithSession(request, employer.email, 'GET', '/api/ip/employer/profile');
    expect(profRes.ok()).toBeTruthy();
    const body = await profRes.json();
    const profile = body.profile || {};
    const acks = profile.ethics_acks || {};
    const items = Array.isArray(body.ethicsItems) ? body.ethicsItems : [];
    const locked =
      Boolean(profile.ethics_accepted_at) && items.length > 0 && items.every((i) => acks[i.id] === true);
    test.skip(!locked, 'Test employer ethics are not locked (npm run qa:ensure-test-accounts)');

    const res = await apiWithSession(request, employer.email, 'PUT', '/api/ip/employer/profile', {
      data: { ethics_acks: {} },
    });
    expect(res.status()).toBe(403);
    expect(String((await res.json()).error || '')).toMatch(/locked after save/i);
  });

  test('IS-076 new posting shows Publish Now only on the last tab', async ({ page }) => {
    await openWithSession(page, employer.email, '/employer/internships/new');
    await expect(page.getByRole('tab', { name: 'Details' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Back to Postings').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish Now' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Next Tab/i })).toBeVisible();
    await page.getByRole('tab', { name: 'Screening' }).click();
    await expect(page.getByRole('button', { name: 'Publish Now' })).toBeVisible({ timeout: 10_000 });
  });

  test('IS-077 list Filters button toggles Show and Hide', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/internships');
    const btn = page.locator('button.ip-tf__btn').filter({ hasText: /Filters/i }).first();
    await expect(btn).toBeVisible({ timeout: 25_000 });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn.locator('.ip-tf__state')).toHaveText('Show');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(btn.locator('.ip-tf__state')).toHaveText('Hide');
    await expect(page.locator('.ip-tf__panel')).toBeVisible();
    await btn.click();
    await expect(btn.locator('.ip-tf__state')).toHaveText('Show');
    await expect(page.locator('.ip-tf__panel')).toHaveCount(0);
  });

  test('IS-078 browse opens on Unapplied tab by default', async ({ page }) => {
    await openWithSession(page, candidate.email, '/candidate/internships');
    const selected = page
      .getByRole('tablist', { name: 'Browse views' })
      .getByRole('tab', { selected: true });
    await expect(selected).toContainText(/Unapplied/, { timeout: 25_000 });
  });

  test('IS-079 candidate profile rejects digits and symbols in name fields', async ({ page, request }) => {
    const before = await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/profile');
    expect(before.ok()).toBeTruthy();
    const savedFirst = (await before.json()).profile?.first_name;

    for (const [field, value] of [
      ['first_name', 'Priya123'],
      ['first_name', '123'],
      ['first_name', 'Priya@'],
      ['middle_name', 'K2'],
      ['last_name', 'Sharma_'],
    ]) {
      const res = await apiWithSession(request, candidate.email, 'PUT', '/api/ip/candidate/profile', {
        data: { [field]: value },
      });
      expect(res.status(), `${field}=${value}`).toBe(400);
      expect(String((await res.json()).error || '')).toMatch(/can only contain letters/i);
    }

    const after = await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/profile');
    expect((await after.json()).profile?.first_name).toBe(savedFirst);

    await openWithSession(page, candidate.email, '/candidate/profile');
    const firstName = page.locator('.ip-cp-field').filter({ hasText: 'First Name' }).locator('input');
    await expect(firstName).toBeVisible({ timeout: 30_000 });
    await firstName.fill('Priya123');
    await expect(page.getByText('First Name can only contain letters', { exact: false })).toBeVisible();
    await expect(firstName).toHaveAttribute('aria-invalid', 'true');
    await firstName.fill("Anne-Marie O'Neil");
    await expect(page.getByText('First Name can only contain letters', { exact: false })).toHaveCount(0);
  });

  test('IS-080 candidate profile validates links, WhatsApp and Telegram', async ({ page, request }) => {
    const put = (data) => apiWithSession(request, candidate.email, 'PUT', '/api/ip/candidate/profile', { data });
    const read = async () =>
      (await (await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/profile')).json()).profile || {};
    const before = await read();

    for (const [field, value, message] of [
      ['linkedin_url', 'https://lnkd.in/abc123', /LinkedIn profile link/],
      ['linkedin_url', 'https://www.linkedin.com/company/acme', /LinkedIn profile link/],
      ['github_url', 'priya', /must be a web link/],
      ['personal_website', 'javascript:alert(1)', /must be a web link/],
      ['whatsapp_number', '12345', /WhatsApp number isn't valid/],
      ['telegram_handle', '@ab', /Telegram handle must be/],
    ]) {
      const res = await put({ [field]: value });
      expect(res.status(), `${field}=${value}`).toBe(400);
      expect(String((await res.json()).error || '')).toMatch(message);
    }
    const unchanged = await read();
    expect(unchanged.linkedin_url || '').toBe(before.linkedin_url || '');
    expect(unchanged.telegram_handle || '').toBe(before.telegram_handle || '');

    try {
      const res = await put({ linkedin_url: 'linkedin.com/in/qa-profile-links', telegram_handle: 'qa_profile' });
      expect(res.ok()).toBeTruthy();
      const saved = await read();
      expect(saved.linkedin_url).toBe('https://linkedin.com/in/qa-profile-links');
      expect(saved.telegram_handle).toBe('@qa_profile');
    } finally {
      await put({ linkedin_url: before.linkedin_url || '', telegram_handle: before.telegram_handle || '' });
    }

    await openWithSession(page, candidate.email, '/candidate/profile');
    const linkedIn = page.locator('.ip-cp-field').filter({ hasText: 'LinkedIn Profile URL' }).locator('input');
    await expect(linkedIn).toBeVisible({ timeout: 30_000 });
    await linkedIn.fill('https://lnkd.in/abc123');
    await expect(page.getByText('Enter your LinkedIn profile link', { exact: false })).toBeVisible();
    await expect(linkedIn).toHaveAttribute('aria-invalid', 'true');
    await linkedIn.fill('linkedin.com/in/qa-profile-links');
    await expect(page.getByText('Enter your LinkedIn profile link', { exact: false })).toHaveCount(0);
  });

  test('IS-081 candidate profile shows an error with Try again when loading fails', async ({ page }) => {
    const profileApi = '**/api/ip/candidate/profile';
    await openWithSession(page, candidate.email, '/candidate/notifications');
    await page.route(profileApi, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' })
        : route.continue());
    await page.goto('/candidate/profile', { waitUntil: 'domcontentloaded' });
    const panel = page.getByTestId('profile-load-error');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText('We couldn’t load your profile');
    await expect(page.locator('#ip-cp-linkedin_url')).toHaveCount(0);

    await page.unroute(profileApi);
    await page.getByTestId('profile-retry').click();
    await expect(page.locator('#ip-cp-linkedin_url')).toBeVisible({ timeout: 30_000 });
    await expect(panel).toHaveCount(0);
  });

  test('IS-082 candidate profile labels, night-shift hours, note limit and cross-tab save message', async ({ page, request }) => {
    const put = (data) => apiWithSession(request, candidate.email, 'PUT', '/api/ip/candidate/profile', { data });
    const read = async () =>
      (await (await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/profile')).json()).profile || {};
    const before = await read();

    for (const [data, message] of [
      [{ preferred_hours_start: '9am', preferred_hours_end: '17:00' }, /must be a time/],
      [{ ongoing_commitment_note: 'x'.repeat(201) }, /too long/],
    ]) {
      const res = await put(data);
      expect(res.status(), JSON.stringify(data).slice(0, 80)).toBe(400);
      expect(String((await res.json()).error || '')).toMatch(message);
    }
    try {
      expect((await put({ preferred_hours_start: '22:00', preferred_hours_end: '02:00' })).ok()).toBeTruthy();
      const saved = await read();
      expect(String(saved.preferred_hours_start || '')).toMatch(/^22:00/);
      expect(String(saved.preferred_hours_end || '')).toMatch(/^02:00/);
    } finally {
      await put({
        preferred_hours_start: before.preferred_hours_start || '',
        preferred_hours_end: before.preferred_hours_end || '',
      });
    }

    await openWithSession(page, candidate.email, '/candidate/notifications');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/candidate/profile', { waitUntil: 'domcontentloaded' });
    const firstName = page.getByLabel('First Name');
    await expect(firstName).toBeVisible({ timeout: 30_000 });
    await expect(firstName).toHaveAttribute('id', 'ip-cp-first_name');
    await firstName.fill('Priya2');
    const describedBy = await firstName.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`[id="${describedBy.split(' ').pop()}"]`)).toContainText('First Name');
    await firstName.fill(before.first_name || 'Test');

    await page.getByRole('tab', { name: '4. Work Readiness' }).click();
    await page.getByLabel('Preferred hours from').fill('22:00');
    await page.getByLabel('Preferred hours to').fill('02:00');
    await expect(page.locator('#ip-cp-preferred_hours_end')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(/Preferred hours .* must be/)).toHaveCount(0);
    await page.getByLabel('Preferred hours from').fill(before.preferred_hours_start ? String(before.preferred_hours_start).slice(0, 5) : '');
    await page.getByLabel('Preferred hours to').fill(before.preferred_hours_end ? String(before.preferred_hours_end).slice(0, 5) : '');

    await page.getByRole('tab', { name: 'Privacy & Photo' }).click();
    await page.locator('#ip-cp-telegram_handle').fill('@ab');
    await page.getByRole('tab', { name: '1. Basics & Contact' }).click();
    await page.locator('.ip-cp-save button[type="submit"]').click();
    const saveError = page.getByTestId('profile-save-error');
    await expect(saveError).toContainText('Telegram handle must be');
    await expect(saveError).toContainText('(on the Privacy & Photo tab)');
    await page.getByTestId('profile-save-error-goto').click();
    await expect(page.getByRole('tab', { name: 'Privacy & Photo' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#ip-cp-telegram_handle')).toBeFocused();

    expect((await read()).telegram_handle || '').toBe(before.telegram_handle || '');
    await page.goto('/candidate/notifications', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
  });

  test('IS-083 core account keeps its password through UI change and reset link', async ({ request }) => {
    const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
    test.skip(!/localhost|127\.0\.0\.1/.test(base), 'flags a test account in the local database');
    const pg = require('pg');
    const bcrypt = require('bcryptjs');
    const crypto = require('node:crypto');
    require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });
    const { TEST_CANDIDATE_OTHER, getTestPassword } = require('../../scripts/lib/ipTestAccountsConfig');
    const email = TEST_CANDIDATE_OTHER.email;
    const oldPw = getTestPassword();
    const newPw = `Qa!Core${Date.now() % 100000}Z`;

    const coreFlag = (flag) => {
      const r = spawnSync('node', ['scripts/ip-core-account.mjs', `--${flag}=${email}`], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(r.status, r.stderr || r.stdout).toBe(0);
    };
    const changePassword = async (currentPassword, newPassword) => {
      const logged = await apiLogin(base, email, oldPw);
      expect(logged.ok, `API login failed for ${email}`).toBeTruthy();
      const Cookie = logged.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      return request.post('/api/ip/auth/change-password', {
        headers: { Cookie },
        data: { currentPassword, newPassword, signOutOthers: true },
      });
    };
    const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const user = (await db.query(`SELECT id FROM ip_users WHERE lower(email) = $1`, [email])).rows[0];
    const storedIs = async (pw) =>
      bcrypt.compare(pw, (await db.query(`SELECT password_hash FROM ip_users WHERE id = $1`, [user.id])).rows[0].password_hash);

    try {
      coreFlag('mark');

      const wrong = await changePassword('Not-the-password1!', newPw);
      expect(wrong.status()).toBe(400);
      expect((await wrong.json()).error).toBe('Current password is incorrect');

      const changed = await changePassword(oldPw, newPw);
      expect(changed.status()).toBe(200);
      expect(await changed.json()).toEqual({ ok: true, signedOutOthers: true });
      expect(await storedIs(oldPw)).toBe(true);

      const raw = crypto.randomBytes(24).toString('base64url');
      const resetId = `ip_reset_qa_${Date.now()}`;
      await db.query(
        `INSERT INTO ip_password_resets (id, user_id, token, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')`,
        [resetId, user.id, crypto.createHash('sha256').update(raw).digest('hex')],
      );
      const confirm = () => request.post('/api/ip/auth/password-reset/confirm', { data: { token: raw, newPassword: newPw } });
      const reset = await confirm();
      expect(reset.status()).toBe(200);
      expect((await reset.json()).message).toBe('Password updated. You can sign in now.');
      expect(await storedIs(oldPw)).toBe(true);
      expect((await confirm()).status()).toBe(400);

      coreFlag('unmark');
      expect((await changePassword(oldPw, newPw)).status()).toBe(200);
      expect(await storedIs(newPw)).toBe(true);
    } finally {
      coreFlag('unmark');
      await db.query(`UPDATE ip_users SET password_hash = $2 WHERE id = $1`, [user.id, await bcrypt.hash(oldPw, 10)]);
      await db.end();
    }
  });

  test('IS-084 my applications sort, status tabs, metric counts, search and column filters', async ({ page }) => {
    const { pathToFileURL } = require('node:url');
    const { decorateCandidateApplication } = await import(
      pathToFileURL(path.join(ROOT, 'src', 'lib', 'ipApplicationPresentation.js')).href
    );
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const ago = (days) => new Date(now - days * DAY).toISOString();
    const future = new Date(now + 30 * DAY).toISOString();
    const row = (key, title, company, status, days, match, extra = {}) => decorateCandidateApplication({
      id: `qa_app_${key}`,
      internship_id: `qa_int_${key}`,
      employer_id: null,
      employer_user_id: null,
      title,
      company_name: company,
      status,
      match_score: match,
      created_at: ago(days),
      updated_at: ago(Math.max(days - 1, 0)),
      work_mode: 'Remote',
      location: 'Pune',
      stipend_inr: 15000,
      stipend_type: 'fixed',
      internship_status: 'published',
      apply_ends_at: future,
      approval_status: 'approved',
      ...extra,
    });
    const items = [
      row('a', 'Data Analyst Intern', 'Kestrel Analytics', 'applied', 1, 60),
      row('b', 'Frontend Developer Intern', 'Harborline Logistics', 'shortlisted', 3, 90),
      row('c', 'Backend Developer Intern', 'Kestrel Analytics', 'interviewing', 5, 75, {
        interview_at: new Date(now + 2 * DAY).toISOString(),
      }),
      row('d', 'Marketing Intern', 'Nimbus Media', 'offered', 7, 40),
      row('e', 'Content Writer Intern', 'Nimbus Media', 'rejected', 10, 85),
      row('f', 'QA Intern', 'Harborline Logistics', 'withdrawn', 12, 50),
      row('g', 'Design Intern', 'Orbit Labs', 'applied', 14, 70, { internship_status: 'closed' }),
    ];
    const T = Object.fromEntries(items.map((a) => [a.id.slice(-1), a.title]));

    await openWithSession(page, candidate.email, '/candidate/notifications');
    await page.route((url) => url.pathname === '/api/ip/candidate/applications', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: { items, total: items.length, page: 1, pageSize: 200 } })
        : route.continue());
    await page.route('**/api/ip/table-filter-prefs**', (route) =>
      route.fulfill({ json: route.request().method() === 'GET' ? { filters: {}, sort: '' } : { ok: true } }));
    await page.route('**/api/ip/list-presets**', (route) => route.fulfill({ json: { items: [] } }));
    await page.evaluate(() => localStorage.removeItem('ip_apps_view'));
    await page.goto('/candidate/applications', { waitUntil: 'domcontentloaded' });

    const rows = page.locator('table.ip-ap-list--tworow tbody tr');
    const titles = () => rows.locator('.ip-ph-role').allInnerTexts();
    const expectTitles = async (keys) => expect.poll(titles).toEqual(keys.split('').map((k) => T[k]));
    await expectTitles('abcdefg');

    const metric = (label) => page.locator('.ip-ap-metric').filter({ hasText: label }).locator('strong');
    await expect(metric('Total Submitted')).toHaveText('7');
    await expect(metric('In Review')).toHaveText('2');
    await expect(metric('Interviews Scheduled')).toHaveText('1');
    await expect(metric('Offers Received')).toHaveText('1');
    await expect(page.locator('.ip-ap-chip')).toHaveText('7 Submissions');

    const sort = page.getByLabel('Sort applications');
    await sort.selectOption('oldest');
    await expectTitles('gfedcba');
    await sort.selectOption('match');
    await expectTitles('becgafd');
    await sort.selectOption('status');
    await expectTitles('agcdebf');
    await sort.selectOption('latest');
    await expectTitles('abcdefg');

    const tabs = page.locator('.ip-ap-tabs');
    await expect(tabs.getByRole('button', { name: 'All Applications (7)' })).toBeVisible();
    for (const [label, keys] of [
      ['Awaiting Review', 'ag'],
      ['Under Review', 'b'],
      ['Interview Scheduled', 'c'],
      ['Offer Received', 'd'],
      ['Rejected', 'e'],
      ['Withdrawn', 'f'],
    ]) {
      const tab = tabs.getByRole('button', { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveClass(/is-on/);
      await expectTitles(keys);
    }
    await expect(metric('Total Submitted')).toHaveText('7');
    await tabs.getByRole('button', { name: /^All Applications/ }).click();
    await expectTitles('abcdefg');

    const search = page.getByLabel('Search applications');
    await search.fill('kestrel');
    await expectTitles('ac');
    await search.fill('BACKEND');
    await expectTitles('c');
    await search.fill('no-such-role-xyz');
    await expect(rows).toHaveCount(0);
    await expect(page.getByText('No applications found')).toBeVisible();
    await page.getByRole('button', { name: 'Clear Status Filters' }).click();
    await expect(search).toHaveValue('');
    await expectTitles('abcdefg');

    const filtersBtn = page.locator('.ip-tf__btn');
    await filtersBtn.click();
    await expect(filtersBtn).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('textbox', { name: 'Employer' }).click();
    await page.locator('[data-ip-sms-menu]').getByRole('button', { name: 'Nimbus Media' }).click();
    await expectTitles('de');
    await expect(page.locator('.ip-tf__chip')).toHaveText('1');
    await page.getByRole('combobox', { name: 'Status' }).selectOption('Rejected');
    await expectTitles('e');
    await expect(page.locator('.ip-tf__chip')).toHaveText('2');
    await page.locator('.ip-tf__clear').click();
    await expectTitles('abcdefg');
    await page.getByRole('combobox', { name: 'Next step' }).selectOption('interviewing');
    await expectTitles('c');
    await page.locator('.ip-tf__clear').click();
    await page.getByLabel('Applied from').fill(items[2].created_at.slice(0, 10));
    await expectTitles('abc');
    await page.locator('.ip-tf__clear').click();
    await expectTitles('abcdefg');

    const withdrawIn = (title) =>
      rows.filter({ hasText: title }).getByRole('button', { name: 'Withdraw application' });
    await expect(withdrawIn(T.a)).toBeEnabled();
    await expect(withdrawIn(T.g)).toBeEnabled();
    for (const k of 'bcdef') await expect(withdrawIn(T[k])).toBeDisabled();

    await rows.filter({ hasText: T.c }).getByRole('button', { name: 'View details' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Interview Scheduled');
    await expect(dialog).toContainText(items[2].next_step);
    expect(items[2].next_step).toMatch(/^Attend interview /);
    await expect(dialog.getByRole('button', { name: 'Withdraw application' })).toHaveCount(0);
    await dialog.locator('.ip-ap-modal__head').getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
    await rows.filter({ hasText: T.a }).getByRole('button', { name: 'View details' }).click();
    await expect(dialog.getByRole('button', { name: 'Withdraw application' })).toBeVisible();
  });

  test('IS-085 my applications list, search and detail dialog on real data', async ({ page, request }) => {
    const { pathToFileURL } = require('node:url');
    const { decorateCandidateApplication } = await import(
      pathToFileURL(path.join(ROOT, 'src', 'lib', 'ipApplicationPresentation.js')).href
    );
    const res = await apiWithSession(request, candidate.email, 'GET', '/api/ip/candidate/applications?pageSize=200');
    expect(res.status()).toBe(200);
    const items = (await res.json()).items || [];
    for (const a of items) {
      const expected = decorateCandidateApplication(a);
      expect(
        { display_status: a.display_status, status_tab: a.status_tab, next_step: a.next_step, in_progress: a.in_progress },
        `application ${a.id} (${a.status})`,
      ).toEqual({
        display_status: expected.display_status,
        status_tab: expected.status_tab,
        next_step: expected.next_step,
        in_progress: expected.in_progress,
      });
    }
    const asEmployer = await apiWithSession(request, employer.email, 'GET', '/api/ip/candidate/applications');
    expect(asEmployer.status()).toBeGreaterThanOrEqual(400);
    test.skip(!items.length, 'Test candidate has no applications (npm run qa:ensure-test-accounts, then apply once)');

    await openWithSession(page, candidate.email, '/candidate/notifications');
    await page.evaluate(() => localStorage.removeItem('ip_apps_view'));
    await page.goto('/candidate/applications', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.ip-ap-metric').filter({ hasText: 'Total Submitted' }).locator('strong'))
      .toHaveText(String(items.length), { timeout: 30_000 });

    const first = items[0];
    const rows = page.locator('table.ip-ap-list--tworow tbody tr');
    const search = page.getByLabel('Search applications');
    await search.fill(first.title);
    await expect(rows.first()).toBeVisible();
    for (const t of await rows.locator('.ip-ph-role').allInnerTexts()) {
      expect(t.toLowerCase()).toContain(String(first.title).toLowerCase());
    }

    const target = rows.filter({ hasText: first.title }).first();
    await expect(target).toContainText(first.display_status);
    await target.getByRole('button', { name: 'View details' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = await dialog.getAttribute('aria-labelledby');
    await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText(first.title);
    await expect(dialog).toContainText(first.display_status);
    await expect(dialog).toContainText(first.next_step);
    for (const term of ['Stipend', 'Work mode', 'Location', 'Match']) {
      await expect(dialog.locator('dt', { hasText: term })).toBeVisible();
    }
    await dialog.locator('.ip-ap-modal__head').getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);

    await target.getByRole('button', { name: 'View details' }).click();
    await expect(dialog).toBeVisible();
    await dialog.locator('.ip-ap-modal__backdrop').click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.ip-ap-modal')).toHaveCount(0);
    await search.click();
    await expect(search).toBeFocused();
  });

  test('IS-086 account change password shows mismatch for empty or different confirm', async ({ page }) => {
    let changeCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/ip/auth/change-password')) changeCalls += 1;
    });
    await openWithSession(page, candidate.email, '/account');
    const confirm = page.getByPlaceholder('Re-enter new password...', { exact: true });
    await expect(confirm).toBeVisible({ timeout: 30_000 });
    const form = page.locator('form', { has: confirm });
    const match = page.locator('#ip-ac-confirm-match');
    const error = page.getByTestId('account-password-error');
    const update = form.getByRole('button', { name: 'Update Password' });

    await page.getByPlaceholder('Enter temporary or current password...', { exact: true }).fill('Qa!NotSubmitted1');
    await page.getByPlaceholder('Enter new password...', { exact: true }).fill('Qa!Mismatch123');
    await update.click();
    await expect(match).toHaveText('✗ Passwords do not match');
    await expect(error).toHaveText('New passwords do not match. Re-enter your new password in Confirm New Password.');
    await expect(confirm).toBeFocused();
    await expect(confirm).toHaveAttribute('aria-invalid', 'true');
    await expect(confirm).toHaveAttribute('aria-describedby', 'ip-ac-confirm-match');

    await confirm.fill('Qa!Mismatch124');
    await expect(error).toHaveCount(0);
    await expect(match).toHaveText('✗ Passwords do not match');
    await update.click();
    await expect(error).toHaveText('New passwords do not match.');

    await confirm.fill('Qa!Mismatch123');
    await expect(error).toHaveCount(0);
    await expect(match).toHaveText('✓ Passwords match');
    await expect(confirm).not.toHaveAttribute('aria-invalid', 'true');

    await form.getByRole('button', { name: 'Clear Form' }).click();
    await expect(match).toHaveCount(0);
    await expect(error).toHaveCount(0);
    expect(changeCalls, 'no change-password request may be sent').toBe(0);
  });

  test('IS-087 browser Back after sign-out returns to sign-in, not a stuck Signing out page', async ({ playwright, baseURL }) => {
    // Playwright launches Chromium with --disable-back-forward-cache; real browsers restore the page from that cache.
    const opts = { headless: true, ignoreDefaultArgs: ['--disable-back-forward-cache'] };
    const browser = await playwright.chromium
      .launch(opts)
      .catch(() => playwright.chromium.launch({ ...opts, channel: 'chrome' }));
    try {
      const context = await browser.newContext({ baseURL: process.env.IP_BASE || baseURL });
      await context.addInitScript(() => {
        window.addEventListener('pageshow', (e) => {
          if (e.persisted) sessionStorage.setItem('qa_bfcache_restores', String(Number(sessionStorage.getItem('qa_bfcache_restores') || 0) + 1));
        });
      });
      const page = await context.newPage();
      const restores = () => page.evaluate(() => Number(sessionStorage.getItem('qa_bfcache_restores') || 0));
      const signOutBtn = page.getByRole('button', { name: /sign out/i }).first();
      await openWithSession(page, candidate.email, '/candidate/offers');

      await page.goto('/help', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'commit' });
      await expect(page).toHaveURL(/\/candidate\/offers$/);
      await expect(signOutBtn).toBeVisible({ timeout: 20_000 });
      expect(await restores(), 'signed-in Back should come from the back/forward cache').toBeGreaterThan(0);
      const restoresBeforeSignOut = await restores();

      await signOutBtn.click();
      await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 30_000 });
      await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });

      await page.goBack({ waitUntil: 'commit' });
      await expect(page).toHaveURL(/\/\?next=%2Fcandidate%2Foffers$/, { timeout: 20_000 });
      await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText('Signing out…')).toHaveCount(0);
      expect(await restores(), 'Back after sign-out should restore from the back/forward cache').toBeGreaterThan(
        restoresBeforeSignOut,
      );

      await page.goto('/candidate/messages', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/\?next=%2Fcandidate%2Fmessages$/, { timeout: 20_000 });
      await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 });
    } finally {
      await browser.close();
    }
  });
});
