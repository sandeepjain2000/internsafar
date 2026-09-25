#!/usr/bin/env node
/**
 * Pre-release / Full tier:
 * 1) All Playwright specs (SUITE_FULL) + Excel apply
 * 2) Deep node scripts: employer-reg-e2e + register-approve-post-apply
 *
 * Manual Excel remaining cases are still human-executed; this prints audit totals.
 *
 *   npm run qa:e2e:full:release
 *
 * Important: use stdio inherit + list reporter; JSON via IP_PW_JSON_REPORT.
 * Do NOT use `--reporter=json` with spawnSync stdout capture — that buffers
 * until the end and looks permanently hung (same class as regression hang).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
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
const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js');

function run(label, cmd, args, opts = {}) {
  console.log(`\n[full-release] === ${label} ===`);
  const { env: extraEnv, ...rest } = opts;
  const r = spawnSync(cmd, args, {
    cwd: root,
    shell: false,
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath, ...(extraEnv || {}) },
    ...rest,
  });
  return r.status ?? 1;
}

console.log(describeSuite('full', SUITE_FULL));
console.log(
  '[full-release] Full = all Playwright + deep register/approve scripts. Manual Excel rows remain human.',
);
console.log(`[full-release] Live list reporter on; JSON → ${report}`);
console.log('[full-release] Hang guard: list+file JSON; direct Playwright CLI (no npx/shell nesting).');

let code = 0;

const pwStatus = run('playwright-full', process.execPath, [playwrightCli, 'test', ...SUITE_FULL], {
  env: { IP_PW_JSON_REPORT: report },
});
if (!existsSync(report)) {
  console.error(
    '[full-release] No JSON report written. Check IP_PW_JSON_REPORT / playwright.config.js reporters.',
  );
}
if (pwStatus !== 0) {
  console.error(`Playwright full suite exited ${pwStatus}`);
  code = pwStatus || 1;
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
