/* eslint-disable no-console */
/**
 * Reset Google Auth test accounts so the same Google accounts can register again.
 *
 * Google registration refuses an email that already has an ip_users row ("An account
 * with this email already exists"), so repeat testing needs the previous run removed.
 *
 * Two levels:
 *   --identity-only   Drop the Google link + pending verification tokens, keep the
 *                     portal account. Use when you only want to re-run the consent
 *                     screen for an account that should stay signed up.
 *   (default)         Hard-delete the portal account and all its rows (via
 *                     hardDeleteIpUser), plus Google identity and tokens, so the same
 *                     Gmail can go through registration from scratch.
 *
 * Protected core accounts (scripts/lib/ipCoreSampleConfig.js) are never deleted; the
 * script downgrades them to identity-only and says so.
 *
 * Usage:
 *   node scripts/reset-google-auth-test-accounts.js a@gmail.com b@gmail.com
 *   node scripts/reset-google-auth-test-accounts.js --dry-run a@gmail.com
 *   node scripts/reset-google-auth-test-accounts.js --identity-only a@gmail.com
 *   node scripts/reset-google-auth-test-accounts.js --list
 *   npm run google:reset -- a@gmail.com
 *
 * @module scripts/reset-google-auth-test-accounts
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser.js');
const coreCfg = require('./lib/ipCoreSampleConfig.js');

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
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

function getDbConfig() {
  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const url =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    env.DATABASE_URL ||
    env.SUPABASE_DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL or SUPABASE_DATABASE_URL is required (.env or .env.local).');
  return { connectionString: url, ssl: { rejectUnauthorized: false } };
}

/** Google tables are created lazily at runtime; tolerate their absence. */
async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return Boolean(r.rows[0]);
}

/** Registration paths a tester can create; 'legacy' rows are seeded/imported, not test signups. */
async function listTestSignups(client) {
  const res = await client.query(
    `SELECT email, role, registration_source, active, created_at
       FROM ip_users
      WHERE registration_source IN ('google','gmail_domain','domain','form')
      ORDER BY created_at DESC`,
  );
  if (!res.rows.length) {
    console.log('No registration-path signups found (only legacy/seeded accounts).');
    return;
  }
  console.log(`Accounts created through a registration path (${res.rows.length}):`);
  for (const r of res.rows) {
    const guard = coreCfg.isProtectedEmail(r.email) ? '  [PROTECTED]' : '';
    console.log(
      `  ${r.email.padEnd(40)} ${String(r.role).padEnd(10)} src=${String(r.registration_source).padEnd(
        13,
      )} active=${r.active} created=${new Date(r.created_at).toISOString()}${guard}`,
    );
  }
}

async function listGoogleAccounts(client) {
  if (!(await tableExists(client, 'ip_google_identities'))) {
    console.log('No ip_google_identities table yet — nothing has completed Google OAuth.');
    return;
  }
  const res = await client.query(
    `SELECT g.email, u.role, u.registration_source, g.first_verified_at, g.last_verified_at
       FROM ip_google_identities g
       JOIN ip_users u ON u.id = g.user_id
      ORDER BY g.last_verified_at DESC`,
  );
  if (!res.rows.length) {
    console.log('No accounts have completed Google OAuth yet.');
    return;
  }
  console.log(`Accounts with a completed Google OAuth (${res.rows.length}):`);
  for (const r of res.rows) {
    console.log(
      `  ${r.email.padEnd(40)} ${String(r.role).padEnd(10)} src=${r.registration_source} last=${new Date(
        r.last_verified_at,
      ).toISOString()}`,
    );
  }
}

async function clearGoogleTraces(client, email, { dryRun }) {
  const out = { identities: 0, verifications: 0 };
  if (await tableExists(client, 'ip_google_identities')) {
    const sql = dryRun
      ? `SELECT count(*)::int AS n FROM ip_google_identities g
           JOIN ip_users u ON u.id = g.user_id WHERE lower(u.email) = $1 OR lower(g.email) = $1`
      : `DELETE FROM ip_google_identities g
          USING ip_users u
          WHERE g.user_id = u.id AND (lower(u.email) = $1 OR lower(g.email) = $1)`;
    const r = await client.query(sql, [email]);
    out.identities = dryRun ? Number(r.rows[0]?.n || 0) : r.rowCount ?? 0;
  }
  if (await tableExists(client, 'ip_google_verifications')) {
    const sql = dryRun
      ? `SELECT count(*)::int AS n FROM ip_google_verifications WHERE lower(email) = $1`
      : `DELETE FROM ip_google_verifications WHERE lower(email) = $1`;
    const r = await client.query(sql, [email]);
    out.verifications = dryRun ? Number(r.rows[0]?.n || 0) : r.rowCount ?? 0;
  }
  return out;
}

async function resetOne(client, rawEmail, { dryRun, identityOnly }) {
  const email = String(rawEmail).trim().toLowerCase();
  const protectedAccount = coreCfg.isProtectedEmail(email);
  const keepAccount = identityOnly || protectedAccount;

  const userRes = await client.query(
    `SELECT id, role, registration_source FROM ip_users WHERE lower(email) = $1`,
    [email],
  );
  const user = userRes.rows[0];

  const traces = await clearGoogleTraces(client, email, { dryRun });
  const label = dryRun ? 'would remove' : 'removed';
  console.log(
    `${email}: ${label} ${traces.identities} google identity row(s), ${traces.verifications} verification token(s)`,
  );

  if (!user) {
    console.log('  no portal account — this Gmail can register now');
    return;
  }
  if (protectedAccount) {
    console.log(`  protected core account (${user.role}) — kept, Google link only was cleared`);
    return;
  }
  if (keepAccount) {
    console.log(`  --identity-only: portal account kept (${user.role}, src=${user.registration_source})`);
    return;
  }

  const result = await hardDeleteIpUser(client, { email, dryRun });
  if (!result.ok) {
    console.log(`  NOT deleted: ${result.error}`);
    return;
  }
  if (dryRun) {
    const counts = Object.entries(result.preview?.counts || {})
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(', ');
    console.log(`  would hard-delete account (${user.role})${counts ? ` — related rows: ${counts}` : ''}`);
    return;
  }
  console.log(`  hard-deleted account (${user.role}) — this Gmail can register again`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const identityOnly = args.includes('--identity-only');
  const wantsList = args.includes('--list');
  const emails = args.filter((a) => !a.startsWith('--'));

  if (!wantsList && !emails.length) {
    console.log('Usage: node scripts/reset-google-auth-test-accounts.js [--dry-run] [--identity-only] <email…>');
    console.log('       node scripts/reset-google-auth-test-accounts.js --list');
    process.exit(1);
  }

  coreCfg.assertProtectedConfigValid();
  const client = new Client(getDbConfig());
  await client.connect();
  try {
    if (wantsList) {
      await listGoogleAccounts(client);
      console.log('');
      await listTestSignups(client);
      if (!emails.length) return;
      console.log('');
    }
    if (dryRun) console.log('DRY RUN — nothing will be changed.\n');
    for (const email of emails) {
      await resetOne(client, email, { dryRun, identityOnly });
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('Failed:', e.message || e);
  process.exit(1);
});
