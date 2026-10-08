#!/usr/bin/env node
/**
 * Every automated InternSafar test, in one run ("test everything" = this):
 * 1) DB-free unit scripts (UNIT_SCRIPTS)
 * 2) All Playwright specs (SUITE_FULL) + Excel apply
 * 3) Checklist runner (API + browser + TC-IS) + Excel apply, then workbench --live
 * 4) Deep node scripts: employer-reg-e2e + register-approve-post-apply
 * 4b) One-off scripts in scripts/manual (03-013, 03-022, 03-015), test-account cases and
 *     throwaway-employer lifecycle cases + Excel apply
 * 5) Whole-workbook coverage (--strict): fails if any automated case was not run today
 *
 * Manual Excel cases stay human-executed; the coverage report lists them by sheet.
 * The dev server leaks memory over long suites — start from a fresh `npm run dev`.
 *
 *   npm run qa:all   (same as npm run qa:e2e:full:release)
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

const UNIT_SCRIPTS = [
  'scripts/test-migration-sql-safe.mjs',
  'scripts/test-ip-workbench-unit.mjs',
  'scripts/test-ip-mail-override.mjs',
  'scripts/test-ip-email-unsubscribe.mjs',
  'scripts/test-demo-text-classifier.mjs',
  'scripts/test-ip-person-name.mjs',
  'scripts/test-ip-profile-contact.mjs',
];

console.log(describeSuite('full', SUITE_FULL));
console.log(
  '[full-release] Full = unit + all Playwright + checklist runner + deep register/approve scripts + coverage. Manual Excel rows remain human.',
);
console.log(`[full-release] Live list reporter on; JSON → ${report}`);
console.log('[full-release] Hang guard: list+file JSON; direct Playwright CLI (no npx/shell nesting).');

let code = 0;

for (const script of UNIT_SCRIPTS) {
  const s = run(`unit ${script}`, process.execPath, [script]);
  if (s !== 0) code = s;
}

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

const checklist = run('checklist-runner', process.execPath, ['scripts/run-internsafar-qa.mjs', '--apply']);
if (checklist !== 0) code = checklist;

const workbench = run('workbench-live', process.execPath, ['scripts/run-ip-workbench-qa.mjs', '--live']);
if (workbench !== 0) code = workbench;

const deep1 = run('employer-reg-e2e', process.execPath, ['scripts/qa-employer-reg-verify-approve-login.mjs']);
if (deep1 !== 0) code = deep1;

const deep2 = run('register-approve-post-apply', process.execPath, [
  'scripts/qa-register-approve-post-apply-smoke.mjs',
]);
if (deep2 !== 0) code = deep2;

// TC-IS-06-007 is left out: it sends a real OTP email and needs a person to paste the code.
const ONE_OFF_SCRIPTS = [
  'scripts/manual/run-tc-is-03-013-duplicate-employer.mjs',
  'scripts/manual/run-tc-is-03-022-register-reject.mjs',
  'scripts/manual/run-tc-is-03-015-self-referral.mjs',
  'scripts/qa-test-account-cases.mjs',
  'scripts/qa-temp-employer-cases.mjs',
];
const oneOffBase = process.env.IP_BASE || 'http://localhost:3000';
for (const script of ONE_OFF_SCRIPTS) {
  const s = run(`one-off ${script}`, process.execPath, [script, oneOffBase]);
  if (s !== 0) code = s;
}
const oneOffApply = run('one-off excel apply', 'python', ['scripts/apply-internsafar-qa-xlsx.py']);
if (oneOffApply !== 0) code = oneOffApply;

run('xlsx-audit', 'python', ['scripts/audit-internsafar-test-cases-xlsx.py']);

const coverage = run('coverage', 'python', ['scripts/report-internsafar-qa-coverage.py', '--strict']);
if (coverage !== 0) code = coverage;

console.log(
  `\n[full-release] Done exit=${code}. Report results against the coverage totals above (all workbook cases), not one runner's count.`,
);
process.exit(code);
