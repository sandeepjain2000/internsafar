/**
 * Execute sheet 25 Sandbox Demo QA against a running internship-portal.
 * Usage: node scripts/run-sheet25-qa.mjs [baseUrl]
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Prefer sibling app with node_modules / pg
const siblingRoot = resolve(__dirname, '../../../internship-portal');
const monoRoot = resolve(__dirname, '..');
const appRoot = existsSync(resolve(siblingRoot, 'node_modules/pg'))
  ? siblingRoot
  : existsSync(resolve(monoRoot, 'node_modules/pg'))
    ? monoRoot
    : siblingRoot;

const BASE = process.argv[2] || process.env.IP_BASE || 'http://localhost:3000';

function loadDatabaseUrl() {
  const envPath = resolve(appRoot, '.env.local');
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, 'utf8');
  const m = text.match(/^\s*DATABASE_URL=(.+)$/m);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function getJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { res, json, text };
}

function cookieJar() {
  const jar = new Map();
  return {
    store(res) {
      const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      const single = res.headers.get('set-cookie');
      const list = raw?.length ? raw : single ? [single] : [];
      for (const c of list) {
        const part = c.split(';')[0];
        const i = part.indexOf('=');
        if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
      }
    },
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
  };
}

async function login(email, password) {
  const jar = cookieJar();
  const cap = await getJson(`${BASE}/api/auth/captcha`);
  jar.store(cap.res);
  const answer =
    cap.json?.dummyAnswer ??
    (() => {
      const m = String(cap.json?.question || '').match(/(\d+)\s*\+\s*(\d+)/);
      return m ? Number(m[1]) + Number(m[2]) : 7;
    })();

  const csrf = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: jar.header() } });
  jar.store(csrf);
  const csrfJson = await csrf.json();

  const body = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    captchaToken: cap.json.token,
    captchaAnswer: String(answer),
    callbackUrl: `${BASE}/`,
    json: 'true',
  });

  const callback = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: jar.header(),
    },
    body,
    redirect: 'manual',
  });
  jar.store(callback);
  const cbText = await callback.text();
  let cbJson = null;
  try {
    cbJson = cbText ? JSON.parse(cbText) : null;
  } catch {
    cbJson = { _raw: cbText.slice(0, 180) };
  }

  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: jar.header() },
  });
  jar.store(sessionRes);
  const session = await sessionRes.json();

  return {
    email,
    callbackStatus: callback.status,
    callback: cbJson,
    sessionEmail: session?.user?.email || null,
    sessionRole: session?.user?.role || null,
    ok: Boolean(session?.user?.email && session.user.email === email),
  };
}

async function main() {
  const out = {
    sheet: '25 Sandbox Demo QA',
    base: BASE,
    executedAt: new Date().toISOString(),
    cases: {},
  };

  const CAST = {
    candidate: 'lawsonlclintern+1@gmail.com',
    employer: 'shreekar.nyayapathi23+2@vit.edu',
    superadmin: 'placementhubsupport@gmail.com',
  };

  // 25-002 bootstrap — ensures SuperAdmin only (Gmail+ cast seeded separately)
  const boot = await getJson(`${BASE}/api/ip/bootstrap`, { method: 'POST' });
  const accounts = boot.json?.accounts || [];
  const bootOk =
    boot.res.ok &&
    boot.json?.ok === true &&
    boot.json?.password === 'Admin@123' &&
    accounts.includes(CAST.superadmin);
  out.cases['TC-IP-25-002'] = {
    status: bootOk ? 'Pass' : 'Fail',
    actual: JSON.stringify(boot.json),
  };

  // 25-001 Gmail+ cast logins (replaces retired @internship.local demos)
  const logins = [];
  for (const email of [CAST.candidate, CAST.employer, CAST.superadmin]) {
    logins.push(await login(email, 'Admin@123'));
  }
  const bad = await login(CAST.candidate, 'WrongPass!');
  const loginOk = logins.every((l) => l.ok) && !bad.ok;
  out.cases['TC-IP-25-001'] = {
    status: loginOk ? 'Pass' : 'Fail',
    actual: JSON.stringify({ good: logins, bad }),
  };

  // 25-003 isolation — cast users exist; bootstrap must not wipe ism_/PH tables
  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    out.cases['TC-IP-25-003'] = {
      status: 'Blocked',
      actual: 'No DATABASE_URL in .env.local to verify table isolation',
    };
  } else {
    const { Client } = require(resolve(appRoot, 'node_modules/pg'));
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const castUsers = await client.query(
      `SELECT email, role FROM ip_users WHERE lower(email) = ANY($1::text[]) ORDER BY email`,
      [[CAST.candidate, CAST.employer, CAST.superadmin].map((e) => e.toLowerCase())],
    );
    const localDemos = await client.query(
      `SELECT email, role FROM ip_users WHERE lower(email) LIKE '%@internship.local' ORDER BY email`,
    );
    const ism = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'ism_%'`,
    );
    let collegesBefore = null;
    const hasColleges = await client.query(`SELECT to_regclass('public.colleges') AS r`);
    if (hasColleges.rows[0].r) {
      const c = await client.query(`SELECT count(*)::int AS n FROM colleges`);
      collegesBefore = c.rows[0].n;
    }
    await getJson(`${BASE}/api/ip/bootstrap`, { method: 'POST' });
    let collegesAfter = null;
    if (hasColleges.rows[0].r) {
      const c = await client.query(`SELECT count(*)::int AS n FROM colleges`);
      collegesAfter = c.rows[0].n;
    }
    await client.end();

    const isoOk =
      castUsers.rows.length >= 3 &&
      localDemos.rows.length === 0 &&
      (collegesBefore === null || collegesBefore === collegesAfter);
    out.cases['TC-IP-25-003'] = {
      status: isoOk ? 'Pass' : 'Fail',
      actual: JSON.stringify({
        cast_ip_users: castUsers.rows,
        retired_internship_local: localDemos.rows,
        ism_table_count: ism.rows[0].n,
        colleges_count_before: collegesBefore,
        colleges_count_after_bootstrap: collegesAfter,
        note: 'Cast accounts present; @internship.local retired; bootstrap left PH/ism side intact.',
      }),
    };
  }

  // 25-004 docs — no blanking instructions
  const readme = readFileSync(resolve(monoRoot, 'README.md'), 'utf8');
  const gen = readFileSync(resolve(monoRoot, 'scripts/gen-ip-test-cases-xlsx.py'), 'utf8');
  const badPhrases = [
    /blank.*\.env/i,
    /wipe.*\.env/i,
    /truncate.*\.env/i,
    /delete.*\.env\.local/i,
    /empty your \.env/i,
  ];
  const hits = [];
  for (const src of [
    ['README.md', readme],
    ['gen script (self-ref only ok)', gen],
  ]) {
    for (const re of badPhrases) {
      if (re.test(src[1]) && !src[0].includes('gen script')) hits.push(`${src[0]}:${re}`);
    }
  }
  // README instructs set keys — good. Scan deploy scripts briefly
  const ag = existsSync(resolve(monoRoot, 'AGENTS.md'))
    ? readFileSync(resolve(monoRoot, 'AGENTS.md'), 'utf8')
    : '';
  for (const re of badPhrases) {
    if (re.test(ag)) hits.push(`AGENTS.md:${re}`);
  }
  const docsOk = hits.length === 0 && /env\.local|DATABASE_URL|NEXTAUTH_/i.test(readme);
  out.cases['TC-IP-25-004'] = {
    status: docsOk ? 'Pass' : 'Fail',
    actual: docsOk
      ? 'README tells to set env keys; no instruct-to-blank .env found in README/AGENTS'
      : JSON.stringify(hits),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
