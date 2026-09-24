#!/usr/bin/env node
/**
 * AWS / production Linux Playwright entry (same specs as Vercel/local, different defaults).
 *
 * Diff vs local/Vercel runner:
 * - Default IP_BASE=https://internsafar.com (prod; override with IP_BASE=… if needed)
 * - PW_NO_WEBSERVER=1 (PM2 already serves — do not spawn npm run dev)
 * - PW_USE_BUNDLED_CHROMIUM=1 (no system Google Chrome on EC2)
 * - IP_QA_SKIP_OPS_PROBES=1 (avoid ops-alert email storms on live)
 * - Default suite = regression (journeys + screens + mobile). Not full:release.
 *
 * On EC2 (after Path B extract + npm install):
 *   npm run playwright:install
 *   npm run qa:e2e:aws
 *   npm run qa:e2e:aws:smoke
 *
 * Requires core demo accounts on the AWS RDS (same emails as qa/helpers/accounts.js)
 * and IP_QA_2FA_* in ~/internship-portal/.env when cores have login OTP enabled.
 *
 * Do NOT run qa:e2e:full:release / employer-reg deep scripts against live prod
 * unless you intentionally want new users on production RDS.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runner = resolve(dirname(fileURLToPath(import.meta.url)), 'run-internsafar.mjs');

const raw = process.argv.slice(2);
let suite = 'regression';
const passthrough = [];
for (const a of raw) {
  if (a === '--smoke' || a === '--suite=smoke') suite = 'smoke';
  else if (a === '--suite=smoke-latest') suite = 'smoke-latest';
  else if (a === '--suite=full' || a === '--full') suite = 'full';
  else if (a === '--suite=regression' || a === '--regression') suite = 'regression';
  else if (a.startsWith('--suite=')) suite = a.slice('--suite='.length);
  else passthrough.push(a);
}

const env = {
  ...process.env,
  IP_BASE: process.env.IP_BASE || 'https://internsafar.com',
  PW_NO_WEBSERVER: process.env.PW_NO_WEBSERVER || '1',
  PW_USE_BUNDLED_CHROMIUM: process.env.PW_USE_BUNDLED_CHROMIUM || '1',
  IP_QA_SKIP_OPS_PROBES: process.env.IP_QA_SKIP_OPS_PROBES || '1',
};

console.log(
  `[internsafar-qa:aws] IP_BASE=${env.IP_BASE} suite=${suite} bundledChromium=1 noWebServer=1 skipOpsProbes=${env.IP_QA_SKIP_OPS_PROBES}`,
);

const child = spawn(process.execPath, [runner, `--suite=${suite}`, ...passthrough], {
  cwd: root,
  stdio: 'inherit',
  env,
  shell: false,
});
child.on('exit', (code) => process.exit(code ?? 1));
