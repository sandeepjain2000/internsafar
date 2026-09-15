#!/usr/bin/env node
/**
 * InternSafar Playwright runner (not Placement Hub qa/runners).
 *   npm run qa:e2e
 *   npm run qa:e2e:regression
 *   node qa/runners/run-internsafar.mjs
 *   node qa/runners/run-internsafar.mjs --suite=regression
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensurePlaywrightBrowsersPath,
  installPlaywrightBrowsersIfNeeded,
} from '../../scripts/lib/ensurePlaywrightBrowsers.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browsersPath = ensurePlaywrightBrowsersPath();
try {
  installPlaywrightBrowsersIfNeeded({ force: false });
} catch (e) {
  console.warn('[playwright] install check:', e.message || e);
}

const REGRESSION_SUITE = [
  'qa/tests/auth.spec.js',
  'qa/tests/google-auth.spec.js',
  'qa/tests/regression.spec.js',
];

const rawArgs = process.argv.slice(2);
const suiteIdx = rawArgs.findIndex((a) => a === '--suite=regression' || a === '--regression');
let args = [...rawArgs];
if (suiteIdx >= 0) {
  args.splice(suiteIdx, 1);
  if (args.length === 0 || args.every((a) => a.startsWith('-'))) {
    args = [...REGRESSION_SUITE, ...args];
  }
}

const child = spawn('npx', ['playwright', 'test', ...args], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
});
child.on('exit', (code) => process.exit(code ?? 1));
