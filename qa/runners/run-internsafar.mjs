#!/usr/bin/env node
/**
 * InternSafar Playwright runner (not Placement Hub qa/runners).
 *   npm run qa:e2e
 *   npm run qa:e2e:smoke
 *   npm run qa:e2e:regression
 *   node qa/runners/run-internsafar.mjs --suite=regression|smoke|full|smoke-latest
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensurePlaywrightBrowsersPath,
  installPlaywrightBrowsersIfNeeded,
} from '../../scripts/lib/ensurePlaywrightBrowsers.mjs';
import { SUITE_BY_NAME, describeSuite } from '../suites.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browsersPath = ensurePlaywrightBrowsersPath();
try {
  installPlaywrightBrowsersIfNeeded({ force: false });
} catch (e) {
  console.warn('[playwright] install check:', e.message || e);
}

const rawArgs = process.argv.slice(2);
let suiteName = null;
const args = [];
for (const a of rawArgs) {
  if (a === '--regression' || a === '--suite=regression') suiteName = 'regression';
  else if (a === '--smoke' || a === '--suite=smoke') suiteName = 'smoke';
  else if (a === '--full' || a === '--suite=full') suiteName = 'full';
  else if (a === '--suite=smoke-latest') suiteName = 'smoke-latest';
  else if (a.startsWith('--suite=')) {
    suiteName = a.slice('--suite='.length);
  } else {
    args.push(a);
  }
}

const onlyFlags = args.length === 0 || args.every((a) => a.startsWith('-'));
let finalArgs = args;
if (suiteName && onlyFlags) {
  const files = SUITE_BY_NAME[suiteName];
  if (!files) {
    console.error(`Unknown suite "${suiteName}". Use: ${Object.keys(SUITE_BY_NAME).join(', ')}`);
    process.exit(2);
  }
  console.log(describeSuite(suiteName, files));
  console.log(
    '[internsafar-qa] Automated Playwright only — Excel still has Manual/Obsolete rows. Use qa:e2e:regression or qa:e2e:full:release for product gates.',
  );
  finalArgs = [...files, ...args];
} else if (!suiteName && onlyFlags) {
  // Default qa:e2e → full Playwright tree under qa/tests
  console.log('[internsafar-qa] suite=default (all qa/tests/*.spec.js)');
}

const child = spawn('npx', ['playwright', 'test', ...finalArgs], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
});
child.on('exit', (code) => process.exit(code ?? 1));
