#!/usr/bin/env node
/**
 * Run InternSafar regression Playwright pack, write JSON report, apply to
 * InternSafar-Test-Cases.xlsx (Test Status / Actual Result / Date Verified).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePlaywrightBrowsersPath, installPlaywrightBrowsersIfNeeded } from './lib/ensurePlaywrightBrowsers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browsersPath = ensurePlaywrightBrowsersPath();
try {
  installPlaywrightBrowsersIfNeeded({ force: false });
} catch (e) {
  console.warn('[playwright] install check:', e.message || e);
}
const report = resolve(root, 'test-results/regression-results.json');
mkdirSync(dirname(report), { recursive: true });

const REGRESSION_SUITE = [
  'qa/tests/auth.spec.js',
  'qa/tests/google-auth.spec.js',
  'qa/tests/regression.spec.js',
];

const pw = spawnSync(
  'npx',
  ['playwright', 'test', ...REGRESSION_SUITE, '--reporter=json'],
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
} else {
  console.error('No JSON report from Playwright; stderr:', (pw.stderr || '').slice(0, 800));
}

const apply = spawnSync(process.execPath, ['scripts/apply-playwright-regression-xlsx.mjs', report], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

if (pw.status !== 0) {
  console.error(`Playwright exited ${pw.status}`);
}
process.exit(pw.status === 0 && apply.status === 0 ? 0 : 1);
