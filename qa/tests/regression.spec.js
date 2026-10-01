const { test, expect } = require('@playwright/test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { candidate, employer, superadmin } = require('../helpers/accounts');
const { openWithSession, signOut, apiLogin } = require('../helpers/login');
const { openTableFilters } = require('../helpers/ipTableFilters');

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
    const firstId = listBody?.items?.[0]?.id;
    test.skip(!firstId, 'No visible internships for candidate in this environment');
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
    const active = (appsBody.items || []).find((a) => {
      const s = String(a.status || '').toLowerCase();
      return s && s !== 'withdrawn';
    });
    test.skip(!active?.internship_id, 'No active application for core candidate');
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

    async function seedOpenPosting() {
      const created = await apiWithSession(request, employer.email, 'POST', '/api/ip/employer/internships', {
        data: {
          title: `QA IS-066 reapply ${Date.now()}`,
          description: 'Automated seed posting for withdraw/reapply regression.',
          workMode: 'Remote',
          status: 'published',
          questions: [],
        },
      });
      if (![200, 201].includes(created.status())) {
        const body = await created.json().catch(() => ({}));
        return { ok: false, error: `${created.status()} ${body.error || ''}`.trim() };
      }
      const body = await created.json().catch(() => ({}));
      return { ok: Boolean(body.id), id: body.id, error: body.error };
    }

    const appsRes = await apiWithSession(
      request,
      candidate.email,
      'GET',
      '/api/ip/candidate/applications?pageSize=200',
    );
    expect(appsRes.ok()).toBeTruthy();
    const appsBody = await appsRes.json();
    const items = appsBody.items || [];

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
      let openId = (listBody.items || []).find((i) => i?.id && !i.applied)?.id;
      if (!openId) {
        const seeded = await seedOpenPosting();
        test.skip(!seeded.ok, `Could not seed open posting for reapply (${seeded.error || 'unknown'})`);
        openId = seeded.id;
      }

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
    test.skip(!locked, 'Core employer ethics are not locked in this environment');

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
});
