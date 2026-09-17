#!/usr/bin/env node
/**
 * Send InternSafar daily progress report (Zepto).
 * Hits POST /api/ip/cron/daily-progress-report on localhost (AWS) or IP_BASE.
 * Subject time = real IST wall-clock at send.
 *
 * Flags: --force --dry-run
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const BASE = process.env.IP_BASE || 'http://localhost:3000';
const secret = process.env.IP_CRON_SECRET || '';
const force = process.argv.includes('--force');
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-ip-cron-secret'] = secret;

  const qs = new URLSearchParams();
  if (force) qs.set('force', '1');
  if (dryRun) qs.set('dryRun', '1');
  const path = `/api/ip/cron/daily-progress-report${qs.toString() ? `?${qs}` : ''}`;

  const res = await fetch(`${BASE.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ force, dryRun }),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    console.error('Failed', res.status, data);
    process.exit(1);
  }
  console.log('Daily progress report:', JSON.stringify(data, null, 2));
  if (data?.skipped) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
