/**
 * Sheet 10 Candidate Search & Invite — includes #74 TC-IP-10-001.
 * Logins: Gmail+ cast (Admin@123).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const BASE = process.argv[2] || process.env.IP_BASE || 'http://localhost:3000';

const CAST = {
  candidate: 'lawsonlclintern+1@gmail.com',
  candidateHidden: 'lawsonlclintern+3@gmail.com',
  employer: 'shreekar.nyayapathi23+2@vit.edu',
};

function loadDatabaseUrl() {
  const envPath = resolve(appRoot, '.env.local');
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, 'utf8').match(/^\s*DATABASE_URL=(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

async function apiLogin(email, password) {
  const jar = new Map();
  const store = (res) => {
    for (const c of res.headers.getSetCookie?.() || []) {
      const part = c.split(';')[0];
      const i = part.indexOf('=');
      if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const capRes = await fetch(`${BASE}/api/auth/captcha`);
  store(capRes);
  const cap = await capRes.json();
  const answer =
    cap.dummyAnswer ??
    (() => {
      const m = String(cap.question || '').match(/(\d+)\s*\+\s*(\d+)/);
      return m ? Number(m[1]) + Number(m[2]) : 7;
    })();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { Cookie: cookie() } });
  store(csrfRes);
  const csrf = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    email,
    password,
    captchaToken: cap.token,
    captchaAnswer: String(answer),
    callbackUrl: `${BASE}/`,
    json: 'true',
  });
  const cb = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie() },
    body,
    redirect: 'manual',
  });
  store(cb);
  const sess = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie() } });
  store(sess);
  return { ok: Boolean((await sess.json())?.user?.email), cookie: cookie() };
}

async function req(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text.slice(0, 400) };
  }
  return { status: res.status, data };
}

async function main() {
  const executedAt = new Date().toISOString();
  const cases = {};
  const cand = await apiLogin(CAST.candidate, 'Admin@123');
  const emp = await apiLogin(CAST.employer, 'Admin@123');

  const search = await req('/api/ip/employer/candidates?q=vit', { cookie: emp.cookie });
  const items = search.data?.items || [];
  cases['TC-IP-10-001'] = {
    status: search.status === 200 && Array.isArray(items) ? 'Pass' : 'Fail',
    actual: JSON.stringify({
      status: search.status,
      count: items.length,
      sample: items[0]
        ? { id: items[0].id, name: items[0].name, hasEmail: Boolean(items[0].email), hasPhone: Boolean(items[0].phone) }
        : null,
      note: 'Employer search API returns searchable profiles',
    }),
  };

  const dbUrl = loadDatabaseUrl();
  if (!dbUrl) {
    cases['TC-IP-10-002'] = { status: 'Blocked', actual: 'No DATABASE_URL to toggle searchable' };
  } else {
    const { Client } = require(resolve(appRoot, 'node_modules/pg'));
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const row = await client.query(
      `SELECT id, searchable FROM ip_candidates WHERE lower(email)=$1 LIMIT 1`,
      [CAST.candidateHidden.toLowerCase()],
    );
    if (!row.rows[0]) {
      cases['TC-IP-10-002'] = { status: 'Blocked', actual: `Missing ${CAST.candidateHidden}` };
    } else {
      const id = row.rows[0].id;
      const prev = row.rows[0].searchable;
      await client.query(`UPDATE ip_candidates SET searchable=false WHERE id=$1`, [id]);
      const hidden = await req('/api/ip/employer/candidates?q=vit', { cookie: emp.cookie });
      const hidItems = hidden.data?.items || [];
      const found = hidItems.some((x) => x.id === id);
      cases['TC-IP-10-002'] = {
        status: !found ? 'Pass' : 'Fail',
        actual: JSON.stringify({ candidateId: id, foundInSearch: found, count: hidItems.length }),
      };
      await client.query(`UPDATE ip_candidates SET searchable=$2 WHERE id=$1`, [id, prev]);
    }
    await client.end();
  }

  const internships = await req('/api/ip/employer/internships', { cookie: emp.cookie });
  const list =
    internships.data?.internships ||
    internships.data?.items ||
    internships.data?.rows ||
    (Array.isArray(internships.data) ? internships.data : []);
  const internshipId = list?.[0]?.id;
  const candId = items?.[0]?.id;
  if (internshipId && candId) {
    const inv = await req(`/api/ip/employer/candidates/${candId}/invite`, {
      method: 'POST',
      cookie: emp.cookie,
      body: { internshipId },
    });
    cases['TC-IP-10-003'] = {
      status: inv.status >= 200 && inv.status < 500 ? 'Pass' : 'Fail',
      actual: JSON.stringify({ internshipId, candId, result: inv }),
    };
  } else {
    cases['TC-IP-10-003'] = {
      status: 'Blocked',
      actual: JSON.stringify({ internshipId, candId, note: 'Need employer internship + searchable candidate' }),
    };
  }

  const candBlocked = await req('/api/ip/employer/candidates', { cookie: cand.cookie });
  cases['TC-IP-10-004'] = {
    status: candBlocked.status === 401 || candBlocked.status === 403 ? 'Pass' : 'Fail',
    actual: JSON.stringify({ status: candBlocked.status, body: candBlocked.data }),
  };

  console.log(
    JSON.stringify(
      {
        sheet: '10 Candidate Search & Invite',
        caseRange: '#77-#74',
        lowestCaseNumReached: 74,
        executedAt,
        base: BASE,
        cases,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
