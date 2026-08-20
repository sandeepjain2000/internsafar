/**
 * AUTH-8 — login shows retry-safe message when DB fails during credential lookup.
 * Uses POST /api/ip/qa/arm-login-db-failure (one-shot) — does not take down DATABASE_URL.
 */
import { QA_ACCOUNTS, cookieJar } from './ipQaAuth.mjs';

const EXPECTED = 'Unable to sign in right now. Please try again.';

function parseAuthCallbackError(rawText) {
  const raw = String(rawText || '');
  try {
    const j = JSON.parse(raw);
    if (j?.url) {
      const u = new URL(j.url, 'http://localhost');
      const err = u.searchParams.get('error');
      if (err) return decodeURIComponent(err.replace(/\+/g, ' '));
    }
  } catch {
    /* not JSON */
  }
  const decoded = decodeURIComponent(raw.replace(/\+/g, ' '));
  const m = decoded.match(/error=([^&"\s]+)/i);
  if (m) return decodeURIComponent(m[1].replace(/\+/g, ' '));
  return decoded;
}

async function attemptCredentialsLogin(base, email, password) {
  const jar = cookieJar();
  const capRes = await fetch(`${base}/api/auth/captcha`);
  jar.store(capRes);
  const cap = await capRes.json();
  const answer =
    cap.dummyAnswer ??
    (() => {
      const m = String(cap.question || '').match(/(\d+)\s*\+\s*(\d+)/);
      return m ? Number(m[1]) + Number(m[2]) : 7;
    })();

  const csrfRes = await fetch(`${base}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
  jar.store(csrfRes);
  const csrf = await csrfRes.json();

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    captchaToken: cap.token,
    captchaAnswer: String(answer),
    callbackUrl: `${base}/`,
    json: 'true',
  });

  const cbRes = await fetch(`${base}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body,
    redirect: 'manual',
  });
  jar.store(cbRes);
  const rawText = await cbRes.text().catch(() => '');

  const sessionRes = await fetch(`${base}/api/auth/session`, { headers: { Cookie: jar.header() } });
  const session = await sessionRes.json().catch(() => null);

  return {
    status: cbRes.status,
    rawText,
    errorText: parseAuthCallbackError(rawText),
    ok: Boolean(session?.user?.email),
  };
}

export async function runAuth8Case({ BASE, assess, blocked }) {
  const PW = QA_ACCOUNTS.candidate.password;
  const email = QA_ACCOUNTS.candidate.email;

  const armRes = await fetch(`${BASE}/api/ip/qa/arm-login-db-failure`, { method: 'POST' });
  if (armRes.status === 404) {
    blocked(
      'AUTH-8',
      'IP_QA_ROUTES_ENABLED=true missing on dev server — add to .env.local and restart npm run dev',
    );
    return;
  }
  if (!armRes.ok) {
    blocked('AUTH-8', `arm-login-db-failure returned ${armRes.status}`);
    return;
  }

  const simulated = await attemptCredentialsLogin(BASE, email, PW);
  const hasExpected =
    simulated.errorText.includes(EXPECTED) || simulated.rawText.includes(encodeURIComponent(EXPECTED));
  const noSession = !simulated.ok;
  const noStack =
    !simulated.rawText.includes('Simulated DB') &&
    !simulated.rawText.includes('ECONNREFUSED') &&
    !simulated.rawText.includes('at queryWithRetry');

  assess('AUTH-8', noSession && hasExpected && noStack, {
    expected: EXPECTED,
    errorText: simulated.errorText.slice(0, 200),
    status: simulated.status,
    session: simulated.ok,
  });

  // Confirm login still works after one-shot simulation is consumed.
  const normal = await attemptCredentialsLogin(BASE, email, PW);
  if (!normal.ok) {
    blocked('AUTH-8', `Post-test login failed — simulation may not be one-shot: ${normal.errorText.slice(0, 120)}`);
  }
}
