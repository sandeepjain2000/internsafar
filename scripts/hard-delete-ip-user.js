#!/usr/bin/env node
/**
 * Hard-delete an ip_* user (employer/candidate/…) with full cascade cleanup.
 *
 * Usage:
 *   node scripts/hard-delete-ip-user.js --email=hr@acme.com --dry-run
 *   node scripts/hard-delete-ip-user.js --email=hr@acme.com --confirm
 *   node scripts/hard-delete-ip-user.js --id=ip_user_xxx --confirm
 *   node scripts/hard-delete-ip-user.js --email=superadmin@internship.local --confirm --allow-superadmin
 *
 * Reusable library:
 *   const { hardDeleteIpUser } = require('./lib/hardDeleteIpUser');
 */

const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const { hardDeleteIpUser, previewHardDeleteIpUser } = require('./lib/hardDeleteIpUser');

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    out[k] = v;
  }
  return out;
}

function parseArgs(argv) {
  const out = { dryRun: false, confirm: false, allowSuperadmin: false, email: '', userId: '' };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--allow-superadmin') out.allowSuperadmin = true;
    else if (a.startsWith('--email=')) out.email = a.slice('--email='.length).trim();
    else if (a.startsWith('--id=')) out.userId = a.slice('--id='.length).trim();
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Hard-delete Internship Portal user (ip_* cascade)

  node scripts/hard-delete-ip-user.js --email=USER@DOMAIN --dry-run
  node scripts/hard-delete-ip-user.js --email=USER@DOMAIN --confirm
  node scripts/hard-delete-ip-user.js --id=ip_user_… --confirm

Options:
  --dry-run            Preview counts only (default if --confirm omitted)
  --confirm            Actually delete (required for destructive run)
  --allow-superadmin   Permit deleting a superadmin account
  --email=…            Lookup by email
  --id=…               Lookup by ip_users.id

Library export: scripts/lib/hardDeleteIpUser.js
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.email && !args.userId)) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  const connectionString =
    process.env.DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL missing in env / .env.local');
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const lookup = { email: args.email, userId: args.userId };
    const wantDelete = args.confirm && !args.dryRun;

    if (!wantDelete) {
      const preview = await previewHardDeleteIpUser(client, lookup);
      console.log(JSON.stringify({ dryRun: true, ...preview }, null, 2));
      if (!preview.found) process.exitCode = 2;
      else console.error('\n(No delete performed. Re-run with --confirm to hard-delete.)');
      return;
    }

    const result = await hardDeleteIpUser(client, {
      ...lookup,
      dryRun: false,
      allowSuperadmin: args.allowSuperadmin,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
