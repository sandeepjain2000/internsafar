#!/usr/bin/env node
/**
 * Pre-release / Full tier:
 * 1) All Playwright specs (SUITE_FULL) + Excel apply
 * 2) Deep node scripts: employer-reg-e2e + register-approve-post-apply
 *
 * Manual Excel remaining cases are still human-executed; this prints audit totals.
 *
 *   npm run qa:e2e:full:release
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePlaywrightBrowsersPath, installPlaywrightBrowsersIfNeeded } from './lib/ensurePlaywrightBrowsers.mjs';
import { SUITE_FULL, describeSuite } from '../qa/suites.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browsersPath = ensurePlaywrightBrowsersPath();
try {
  installPlaywrightBrowsersIfNeeded({ force: false });
} catch (e) {
  console.warn('[playwright] install check:', e.message || e);
}

const report = resolve(root, 'test-results/full-release-results.json');
mkdirSync(dirname(report), { recursive: true });

function run(label, cmd, args, opts = {}) {
  console.log(`\n[full-release] === ${label} ===`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: opts.stdio || 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    maxBuffer: 20 * 1024 * 1024,
    ...opts,
  });
  return r.status ?? 1;
}

console.log(describeSuite('full', SUITE_FULL));
console.log(
  '[full-release] Full = all Playwright + deep register/approve scripts. Manual Excel rows remain human.',
);

let code = 0;

const pw = spawnSync(
  'npx',
  ['playwright', 'test', ...SUITE_FULL, '--reporter=json'],
  {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
    maxBuffer: 20 * 1024 * 1024,
  },
);
const jsonOut = (pw.stdout || '').trim();
const start = jsonOut.indexOf('{');
if (start >= 0) {
  writeFileSync(report, jsonOut.slice(start));
  console.log(`Wrote ${report}`);
}
if (pw.status !== 0) {
  console.error(`Playwright full suite exited ${pw.status}`);
  code = pw.status || 1;
}

const apply = spawnSync(process.execPath, ['scripts/apply-playwright-regression-xlsx.mjs', report], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (apply.status !== 0) code = apply.status || 1;

const deep1 = run('employer-reg-e2e', process.execPath, ['scripts/qa-employer-reg-verify-approve-login.mjs']);
if (deep1 !== 0) code = deep1;

const deep2 = run('register-approve-post-apply', process.execPath, [
  'scripts/qa-register-approve-post-apply-smoke.mjs',
]);
if (deep2 !== 0) code = deep2;

run('xlsx-audit', 'python', ['scripts/audit-internsafar-test-cases-xlsx.py']);

console.log(
  `\n[full-release] Done exit=${code}. Reminder: execute remaining Manual Excel cases for release sign-off.`,
);
process.exit(code);
