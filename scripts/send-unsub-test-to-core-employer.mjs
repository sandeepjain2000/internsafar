/**
 * One-shot: persist unsubscribe token, then send real email to core employer.
 * Run: node scripts/send-unsub-test-to-core-employer.mjs
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

const CORE_EMPLOYER = 'placementhubsupport@gmail.com';

function rewriteAliases(source) {
  return source.replace(/'@\/lib\/([^']+)'/g, (_m, name) => {
    const file = /\.[a-z]+$/i.test(name) ? name : `${name}.js`;
    return `'${pathToFileURL(path.join(libDir, file)).href}'`;
  });
}

const tmpDir = fs.mkdtempSync(path.join(projectRoot, '.unsub-send-'));
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const db = { query: (text, params) => client.query(text, params) };

  const unsubPath = path.join(tmpDir, 'ipEmailUnsubscribe.mjs');
  fs.writeFileSync(
    unsubPath,
    rewriteAliases(fs.readFileSync(path.join(libDir, 'ipEmailUnsubscribe.js'), 'utf8')),
  );
  const unsub = await import(pathToFileURL(unsubPath).href);
  const format = await import(pathToFileURL(path.join(libDir, 'ipEmailUnsubscribeFormat.js')).href);
  const originMod = await import(pathToFileURL(path.join(libDir, 'ipAppOrigin.js')).href);

  const token = await unsub.getOrCreateUnsubscribeToken(CORE_EMPLOYER, undefined, db);
  assert.ok(format.isValidUnsubscribeToken(token));
  const origin = originMod.resolveAppOrigin();
  const unsubUrl = format.buildUnsubscribeUrl(origin, token);

  const subject = `[InternSafar QA] Unsubscribe footer check ${new Date().toISOString()}`;
  const baseHtml = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0f172a">
  <p>Hi Nova Labs / core employer,</p>
  <p>This is a QA mail to confirm the <strong>unsubscribe</strong> footer.</p>
  <p>Click <strong>unsubscribe</strong> in the footer (or open the link below). You should see a PENDING confirmation. Emails are not turned off yet.</p>
  <p><a href="${unsubUrl}">${unsubUrl}</a></p>
  <p>— InternSafar QA</p>
  </body></html>`;

  const mailed = format.applyUnsubscribeFooter(
    {
      to: CORE_EMPLOYER,
      subject,
      html: baseHtml,
      text: `InternSafar QA unsubscribe check.\nunsubscribe: ${unsubUrl}\n`,
    },
    unsubUrl,
  );

  // Send via real mailer, but skip its own footer persist (token already in DB).
  let mailSource = rewriteAliases(fs.readFileSync(path.join(libDir, 'mail.js'), 'utf8'));
  mailSource = mailSource.replace(
    /async function withUnsubscribeFooter\(opts, intendedList\) \{[\s\S]*?\n\}/,
    `async function withUnsubscribeFooter(opts) { return opts; }`,
  );
  const mailPath = path.join(tmpDir, 'mail.mjs');
  fs.writeFileSync(mailPath, mailSource);
  const mail = await import(pathToFileURL(mailPath).href);

  const result = await mail.sendMail(mailed);
  assert.equal(result.ok, true, 'sendMail should succeed');

  console.log('SENT', {
    to: CORE_EMPLOYER,
    subject,
    provider: result.provider,
    usedOverride: Boolean(result.usedOverride),
    copiedTo: result.copiedTo || null,
  });
  console.log('OPEN_LINK', unsubUrl);
  console.log('NOTE: open the link (or footer unsubscribe) while local/Vercel app has this code deployed for the confirmation page.');
} finally {
  await client.end().catch(() => {});
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
