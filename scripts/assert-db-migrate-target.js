/* eslint-disable no-console */
/**
 * Accidental AWS RDS write guard for migrate/seed scripts.
 *
 * Intent (only this):
 *   If migrate runs on a laptop or on Vercel, refuse DATABASE_URL hosts that
 *   look like AWS RDS — so a local/Vercel env pointing at prod RDS cannot
 *   accidentally apply schema/seed there.
 *
 * Not the intent:
 *   - Ban Path C / sql-only on EC2 against empty RDS
 *   - Require a new env flag to touch AWS
 *   - Copy or block "pushing changes" in the AWS handoff zip generally
 *
 * Detection: Vercel env → block RDS. EC2 instance markers → allow RDS.
 * Anywhere else (typical local laptop) → block RDS. Non-RDS hosts always OK.
 * Still requires the existing IP_ALLOW_DB_MIGRATE gate separately.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function readEnvFile(filename) {
  const envPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    out[k] = v;
  }
  return out;
}

function resolveDatabaseUrl() {
  const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
  return (
    process.env.IP_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    fileEnv.IP_DATABASE_URL ||
    fileEnv.DATABASE_URL ||
    fileEnv.SUPABASE_DATABASE_URL ||
    ''
  );
}

function hostnameFromUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isAwsRdsHost(hostname) {
  if (!hostname) return false;
  return (
    hostname.endsWith('.rds.amazonaws.com') ||
    hostname.endsWith('.rds.amazonaws.com.cn') ||
    (hostname.includes('.rds.') && hostname.includes('amazonaws'))
  );
}

/** Vercel build / serverless — migrate must not target AWS RDS from here. */
function isRunningOnVercel() {
  return (
    process.env.VERCEL === '1' ||
    String(process.env.VERCEL || '').toLowerCase() === 'true' ||
    !!process.env.VERCEL_ENV
  );
}

/**
 * EC2 (Path C / sql-only on the server) — RDS is an expected target.
 * Uses local DMI/hypervisor markers only (no network, no env flag).
 */
function isRunningOnEc2() {
  const files = [
    ['/sys/devices/virtual/dmi/id/sys_vendor', /amazon/i],
    ['/sys/devices/virtual/dmi/id/bios_vendor', /amazon/i],
    ['/sys/class/dmi/id/sys_vendor', /amazon/i],
    ['/sys/class/dmi/id/bios_vendor', /amazon/i],
  ];
  for (const [file, re] of files) {
    try {
      if (fs.existsSync(file) && re.test(fs.readFileSync(file, 'utf8'))) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  try {
    const uuidPath = '/sys/hypervisor/uuid';
    if (fs.existsSync(uuidPath)) {
      const uuid = fs.readFileSync(uuidPath, 'utf8').trim().toLowerCase();
      if (uuid.startsWith('ec2')) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function printBlockedAndExit(hostname, reason) {
  console.error('');
  console.error('=== BLOCKED: migrate refused against AWS RDS from this machine ===');
  console.error('');
  console.error('Why:');
  console.error('  Migrate/seed on local or Vercel must not accidentally write to AWS RDS');
  console.error('  when DATABASE_URL points at an RDS hostname.');
  console.error(`  Detected host: ${hostname || '(unknown)'}`);
  console.error(`  Context: ${reason}`);
  console.error('');
  console.error('What to do:');
  console.error('  Local/Vercel work → use a non-RDS DATABASE_URL (e.g. localhost / your Vercel DB).');
  console.error('  Fresh/empty RDS on EC2 (Path C) → run migrate on the EC2 host itself:');
  console.error('    IP_ALLOW_DB_MIGRATE=1 npm run deploy:fresh-aws-db');
  console.error('');
  process.exit(1);
}

/**
 * @param {string[]} [_argv] unused (kept for call-site compatibility)
 * @param {{ connectionString?: string, forceEc2?: boolean, forceVercel?: boolean }} [opts]
 */
function assertDbMigrateTargetAllowed(_argv, opts) {
  const rawUrl = (opts && opts.connectionString) || resolveDatabaseUrl();
  const hostname = hostnameFromUrl(rawUrl);
  if (!isAwsRdsHost(hostname)) {
    return { hostname, awsRds: false };
  }

  const onVercel =
    opts && typeof opts.forceVercel === 'boolean'
      ? opts.forceVercel
      : isRunningOnVercel();
  if (onVercel) {
    printBlockedAndExit(hostname, 'running on Vercel');
  }

  const onEc2 =
    opts && typeof opts.forceEc2 === 'boolean' ? opts.forceEc2 : isRunningOnEc2();
  if (onEc2) {
    return { hostname, awsRds: true, allowed: true, where: 'ec2' };
  }

  printBlockedAndExit(hostname, 'not on EC2 (treat as local)');
}

module.exports = {
  assertDbMigrateTargetAllowed,
  isAwsRdsHost,
  isRunningOnEc2,
  isRunningOnVercel,
  resolveDatabaseUrl,
};
