#!/usr/bin/env node
/**
 * Process optional pre-launch / pre-close posting reminders (§3.2).
 *
 * Usage:
 *   node scripts/process-ip-schedule-reminders.mjs
 *   IP_BASE=https://… IP_CRON_SECRET=… node scripts/process-ip-schedule-reminders.mjs
 *
 * Requires the app to be reachable (dev or deploy). Hits POST /api/ip/cron/schedule-reminders.
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const BASE = process.env.IP_BASE || process.argv[2] || 'http://localhost:3000';
const secret = process.env.IP_CRON_SECRET || '';

async function main() {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-ip-cron-secret'] = secret;

  const res = await fetch(`${BASE.replace(/\/$/, '')}/api/ip/cron/schedule-reminders`, {
    method: 'POST',
    headers,
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
  console.log('Schedule reminders:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
