#!/usr/bin/env node
/**
 * Local / ops trigger for auto-reject after apply deadline.
 * Hits /api/ip/cron/auto-reject-expired (app must be running).
 *
 *   npm run cron:auto-reject-expired
 *   IP_BASE=https://… IP_CRON_SECRET=… npm run cron:auto-reject-expired
 *
 * Vercel: vercel.json cron calls the same path (GET) with CRON_SECRET.
 * AWS (future): schedule curl/crontab against production — see comment on the route.
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
dotenv.config({ path: resolve(appRoot, '.env.local') });
dotenv.config({ path: resolve(appRoot, '.env') });

const BASE = process.env.IP_BASE || process.argv[2] || 'http://localhost:3000';
const secret = process.env.IP_CRON_SECRET || process.env.CRON_SECRET || '';

async function main() {
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-ip-cron-secret'] = secret;

  const res = await fetch(`${BASE.replace(/\/$/, '')}/api/ip/cron/auto-reject-expired`, {
    method: 'POST',
    headers,
    body: '{}',
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
  console.log('Auto-reject expired:', JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
