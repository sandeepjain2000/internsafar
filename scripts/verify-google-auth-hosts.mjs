/**
 * Real Google OAuth readiness check (not superficial).
 * Proves: providers, CSRF, sign-in start, redirect to accounts.google.com,
 * client_id present, redirect_uri host matches the site under test,
 * google-intent API, error query pages do not 500, /app router page loads.
 *
 * Does NOT complete Google consent (needs a human Google account).
 *
 * Usage:
 *   node scripts/verify-google-auth-hosts.mjs
 *   node scripts/verify-google-auth-hosts.mjs http://localhost:3000 https://internship-portal-sigma-mauve.vercel.app
 */
import { CookieJar } from './lib/cookieJarLite.mjs';

const DEFAULT_HOSTS = [
  'http://localhost:3000',
  'https://internship-portal-sigma-mauve.vercel.app',
  'https://internsafar.com',
];

const hosts = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_HOSTS;

function parseQuery(url) {
  try {
    return Object.fromEntries(new URL(url).searchParams.entries());
  } catch {
    return {};
  }
}

async function followToGoogle(startUrl, jar, maxHops = 8) {
  let url = startUrl;
  const hops = [];
  for (let i = 0; i < maxHops; i += 1) {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { cookie: jar.header(), 'user-agent': 'InternSafar-GoogleAuth-Verify/1.0' },
    });
    jar.absorb(res, url);
    const loc = res.headers.get('location');
    hops.push({ status: res.status, url, location: loc || null });
    if (loc) {
      url = new URL(loc, url).href;
      if (/accounts\.google\.com/i.test(url)) {
        return { ok: true, googleUrl: url, hops };
      }
      continue;
    }
    const text = await res.text().catch(() => '');
    return { ok: false, googleUrl: null, hops, bodySnippet: text.slice(0, 300) };
  }
  return { ok: false, googleUrl: null, hops, bodySnippet: 'max hops' };
}

async function startGoogleSignIn(base, jar) {
  const csrfRes = await fetch(`${base}/api/auth/csrf`, {
    headers: { cookie: jar.header() },
  });
  jar.absorb(csrfRes, base);
  if (!csrfRes.ok) {
    return { error: `csrf status ${csrfRes.status}` };
  }
  const csrfJson = await csrfRes.json();
  const csrfToken = csrfJson?.csrfToken;
  if (!csrfToken) return { error: 'no csrfToken' };

  const body = new URLSearchParams({
    csrfToken,
    callbackUrl: `${base}/app`,
    json: 'true',
  });

  const signRes = await fetch(`${base}/api/auth/signin/google`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: jar.header(),
      'user-agent': 'InternSafar-GoogleAuth-Verify/1.0',
    },
    body,
  });
  jar.absorb(signRes, base);

  let next = signRes.headers.get('location');
  if (!next && signRes.ok) {
    const j = await signRes.json().catch(() => ({}));
    next = j?.url || null;
  }
  if (!next) {
    const t = await signRes.text().catch(() => '');
    return {
      error: `signin/google no redirect status=${signRes.status}`,
      bodySnippet: t.slice(0, 400),
    };
  }
  const abs = new URL(next, base).href;
  return followToGoogle(abs, jar);
}

async function checkHost(base) {
  const jar = new CookieJar();
  const report = { base, checks: {}, failures: [], warnings: [] };

  // 1) Home must render email/password login — Google sign-in button must NOT be present
  {
    const res = await fetch(`${base}/`, { headers: { 'user-agent': 'InternSafar-GoogleAuth-Verify/1.0' } });
    const html = await res.text();
    report.checks.homeStatus = res.status;
    report.checks.homeHasEmailField = /id=["']email["']/i.test(html);
    report.checks.homeHasGoogleBtn = /ip-gemini-google-btn|Sign in with Google/i.test(html);
    if (res.status !== 200) report.failures.push(`home status ${res.status}`);
    if (!report.checks.homeHasEmailField) {
      report.failures.push('home missing email login field in HTML');
    }
    if (report.checks.homeHasGoogleBtn) {
      report.failures.push('home still exposes Google sign-in button (login is email/password only)');
    }
  }

  // 2) Providers must include google with non-empty config surface
  {
    const res = await fetch(`${base}/api/auth/providers`);
    const providers = await res.json().catch(() => ({}));
    report.checks.providersStatus = res.status;
    report.checks.hasGoogleProvider = Boolean(providers.google);
    report.checks.hasCredentials = Boolean(providers.credentials);
    if (!providers.google) report.failures.push('google provider missing from /api/auth/providers');
  }

  // 3) Real OAuth start via register intent → Google accounts URL with client_id + redirect_uri
  {
    const intentJar = new CookieJar();
    const intentRes = await fetch(`${base}/api/ip/auth/google-intent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: intentJar.header() },
      body: JSON.stringify({ purpose: 'candidate-register' }),
    });
    intentJar.absorb(intentRes, base);
    const started = await startGoogleSignIn(base, intentJar);
    if (started.error) {
      report.failures.push(`oauth start (register intent): ${started.error}`);
      report.checks.oauth = started;
    } else if (!started.ok) {
      report.failures.push('oauth start (register intent) did not reach accounts.google.com');
      report.checks.oauth = started;
    } else {
      const q = parseQuery(started.googleUrl);
      const redirectUri = q.redirect_uri || '';
      const clientId = q.client_id || '';
      let redirectHost = '';
      try {
        redirectHost = new URL(redirectUri).origin;
      } catch {
        redirectHost = '';
      }
      const baseOrigin = new URL(base).origin;
      report.checks.oauth = {
        reachedGoogle: true,
        via: 'google-intent candidate-register',
        clientIdPrefix: clientId ? `${clientId.slice(0, 20)}…` : '',
        hasClientId: Boolean(clientId),
        redirectUri,
        redirectHost,
        baseOrigin,
        redirectMatchesHost: redirectHost === baseOrigin,
        scope: q.scope || '',
        hops: started.hops.length,
      };
      if (!clientId) report.failures.push('Google authorize URL missing client_id');
      if (!redirectUri) report.failures.push('Google authorize URL missing redirect_uri');
      if (redirectHost && redirectHost !== baseOrigin) {
        report.failures.push(
          `CRITICAL redirect_uri host mismatch: OAuth callback is ${redirectHost} but site is ${baseOrigin}`,
        );
      }
      if (redirectUri && !/\/api\/auth\/callback\/google$/i.test(redirectUri)) {
        report.failures.push(`unexpected redirect_uri path: ${redirectUri}`);
      }
    }
  }

  // 4) google-intent API (register path)
  {
    const res = await fetch(`${base}/api/ip/auth/google-intent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purpose: 'candidate-register' }),
    });
    const json = await res.json().catch(() => ({}));
    const setCookie = res.headers.getSetCookie?.() || [];
    const cookieHeader = res.headers.get('set-cookie') || '';
    const hasIntentCookie =
      setCookie.some((c) => /ip_google_intent=candidate-register/i.test(c)) ||
      /ip_google_intent=candidate-register/i.test(cookieHeader);
    report.checks.googleIntent = {
      status: res.status,
      ok: Boolean(json.ok),
      returnTo: json.returnTo || null,
      hasIntentCookie,
    };
    if (res.status !== 200 || !json.ok) report.failures.push('google-intent API failed');
    if (!hasIntentCookie) report.failures.push('google-intent did not Set-Cookie ip_google_intent');
  }

  // 5) Error query pages must not 500 / crash
  for (const err of [
    'GoogleLoginDisabled',
    'GoogleAccountNotLinked',
    'GoogleAccountInactive',
    'GoogleNoEmail',
    'GoogleEmailUnverified',
  ]) {
    const res = await fetch(`${base}/?error=${err}`);
    if (res.status !== 200) report.failures.push(`error page ${err} status ${res.status}`);
  }
  report.checks.errorPagesOk = !report.failures.some((f) => f.startsWith('error page'));

  // 6) /app must load (callback target) — guests redirect/gate, must not 500
  {
    const res = await fetch(`${base}/app`, { redirect: 'manual' });
    report.checks.appStatus = res.status;
    if (res.status >= 500) report.failures.push(`/app crashed with ${res.status}`);
  }

  // 7) Session endpoint must not crash
  {
    const res = await fetch(`${base}/api/auth/session`);
    report.checks.sessionStatus = res.status;
    if (res.status >= 500) report.failures.push(`session crashed ${res.status}`);
  }

  report.ok = report.failures.length === 0;
  return report;
}

const results = [];
for (const host of hosts) {
  try {
    results.push(await checkHost(host.replace(/\/$/, '')));
  } catch (e) {
    results.push({ base: host, ok: false, failures: [`exception: ${e.message}`], checks: {} });
  }
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
