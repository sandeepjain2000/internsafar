#!/usr/bin/env node
/**
 * Weekly employer documents reminder — hits POST /api/ip/cron/employer-docs-reminder (app must be running).
 *
 *   npm run cron:employer-docs-reminder                         weekly run (needs IP_EMPLOYER_DOCS_REMINDER_ENABLED=true on the app)
 *   npm run cron:employer-docs-reminder -- --dry-run            list who is due, send nothing
 *   npm run cron:employer-docs-reminder -- --employer=<id> --force   one employer only (testing)
 *   IP_BASE=https://… IP_CRON_SECRET=… npm run cron:employer-docs-reminder
 *
 * AWS EC2 crontab (server clock is UTC; Monday 10:00 IST):
 *   30 4 * * 1 cd ~/internship-portal && /usr/bin/node scripts/process-ip-employer-docs-reminder.mjs >> ~/logs/employer-docs-reminder.log 2>&1
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local'), quiet: true });
dotenv.config({ path: resolve(appRoot, '.env'), quiet: true });

const BASE = process.env.IP_BASE || 'http://localhost:3000';
const secret = process.env.IP_CRON_SECRET || process.env.CRON_SECRET || '';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).trim() : '';
}

async function main() {
  const body = {
    dryRun: process.argv.includes('--dry-run'),
    force: process.argv.includes('--force'),
    employerId: arg('employer') || undefined,
  };
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-ip-cron-secret'] = secret;

  const res = await fetch(`${BASE.replace(/\/$/, '')}/api/ip/cron/employer-docs-reminder`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  console.log(`=== ${new Date().toISOString()} employer docs reminder ===`);
  if (!res.ok) {
    console.error('Failed', res.status, data);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
  if (data?.failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
