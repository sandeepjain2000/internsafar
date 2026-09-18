/**
 * Send the real product "New applicant" employer email (same copy as
 * src/app/api/ip/candidate/applications/route.js) to the core employer,
 * with the normal unsubscribe footer (word "unsubscribe" linked — not a raw URL).
 *
 * Run: node scripts/send-core-employer-new-applicant-mail.mjs
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const libDir = path.join(projectRoot, 'src', 'lib');
const CORE_EMPLOYER = 'placementhubsupport@gmail.com';

function readEnvFile(filename) {
  const envPath = path.join(projectRoot, filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
}

function rewriteAliases(source) {
  return source.replace(/'@\/lib\/([^']+)'/g, (_m, name) => {
    const file = /\.[a-z]+$/i.test(name) ? name : `${name}.js`;
    return `'${pathToFileURL(path.join(libDir, file)).href}'`;
  });
}

const tmpDir = fs.mkdtempSync(path.join(projectRoot, '.unsub-applicant-send-'));
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const db = { query: (text, params) => client.query(text, params) };

  const posting = await client.query(
    `SELECT i.title
       FROM ip_internships i
       JOIN ip_employers e ON e.id = i.employer_id
       JOIN ip_users u ON u.id = e.user_id
      WHERE lower(u.email) = $1
      ORDER BY i.created_at DESC NULLS LAST
      LIMIT 1`,
    [CORE_EMPLOYER.toLowerCase()],
  );
  const title = posting.rows[0]?.title || 'Internship posting';

  const unsubPath = path.join(tmpDir, 'ipEmailUnsubscribe.mjs');
  fs.writeFileSync(
    unsubPath,
    rewriteAliases(fs.readFileSync(path.join(libDir, 'ipEmailUnsubscribe.js'), 'utf8')),
  );
  const unsub = await import(pathToFileURL(unsubPath).href);
  const format = await import(pathToFileURL(path.join(libDir, 'ipEmailUnsubscribeFormat.js')).href);
  const originMod = await import(pathToFileURL(path.join(libDir, 'ipAppOrigin.js')).href);

  const token = await unsub.getOrCreateUnsubscribeToken(CORE_EMPLOYER, undefined, db);
  const unsubUrl = format.buildUnsubscribeUrl(originMod.resolveAppOrigin(), token);

  // Exact product copy from candidate applications → employer mail
  const subject = `New applicant — ${title}`;
  const baseHtml = `<p>You received a new application for <strong>${title}</strong>.</p><p>Sign in to review applicants.</p>`;
  const baseText = `New application for ${title}.`;
  const mailed = format.applyUnsubscribeFooter(
    { to: CORE_EMPLOYER, subject, html: baseHtml, text: baseText },
    unsubUrl,
  );

  assert.match(mailed.html, />unsubscribe<\/a>/i);
  assert.ok(!mailed.html.includes(`>${unsubUrl}<`), 'HTML must not show the raw unsubscribe URL as link text');

  let mailSource = rewriteAliases(fs.readFileSync(path.join(libDir, 'mail.js'), 'utf8'));
  mailSource = mailSource.replace(
    /async function withUnsubscribeFooter\(opts, intendedList\) \{[\s\S]*?\n\}/,
    `async function withUnsubscribeFooter(opts) { const { skipUnsubscribe, ...rest } = opts || {}; return rest; }`,
  );
  const mailPath = path.join(tmpDir, 'mail.mjs');
  fs.writeFileSync(mailPath, mailSource);
  const mail = await import(pathToFileURL(mailPath).href);

  const result = await mail.sendMail(mailed);
  assert.equal(result.ok, true);

  console.log('SENT', {
    kind: 'product:new-applicant-to-employer',
    to: CORE_EMPLOYER,
    subject,
    provider: result.provider,
    usedOverride: Boolean(result.usedOverride),
    copiedTo: result.copiedTo || null,
    footer: 'If you no longer want these emails, unsubscribe (linked)',
  });
} finally {
  await client.end().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
