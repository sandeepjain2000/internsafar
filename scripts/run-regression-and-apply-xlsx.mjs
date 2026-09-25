#!/usr/bin/env node
/**
 * Run InternSafar product regression Playwright pack, write JSON report, apply to
 * InternSafar-Test-Cases.xlsx (Test Status / Actual Result / Date Verified).
 *
 * Suite = SUITE_REGRESSION (smoke + IS-* + journeys + screens + mobile).
 *
 * Honest framing:
 * - Excel workbook holds Manual + Obsolete rows; Playwright does not automate all.
 * - After apply, prints coverage stats (mapped Automated vs remaining Manual).
 *
 * Hang guards (keep these — do not regress):
 * 1) stdio: 'inherit' + Playwright list reporter for live progress
 * 2) JSON via IP_PW_JSON_REPORT → file (playwright.config.js), never `--reporter=json`
 *    with spawnSync stdout capture (buffers forever / looks hung)
 * 3) Invoke `@playwright/test/cli.js` with process.execPath + shell:false
 *    (Windows npx+cmd nesting also hid list output)
 * 4) xlsx audit uses stdio inherit (not encoding/pipe capture)
 *
 * Filter UI: list/browse screens use IpTableFiltersShell (`.ip-tf__btn` / `.ip-tf__panel`).
 * Specs must use qa/helpers/ipTableFilters.js — not legacy `.ip-br-drawer` / mobile sheets.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePlaywrightBrowsersPath, installPlaywrightBrowsersIfNeeded } from './lib/ensurePlaywrightBrowsers.mjs';
import { SUITE_REGRESSION, describeSuite } from '../qa/suites.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browsersPath = ensurePlaywrightBrowsersPath();
try {
  installPlaywrightBrowsersIfNeeded({ force: false });
} catch (e) {
  console.warn('[playwright] install check:', e.message || e);
}
const report = resolve(root, 'test-results/regression-results.json');
mkdirSync(dirname(report), { recursive: true });
const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js');

if (!existsSync(playwrightCli)) {
  console.error(`[internsafar-qa] Missing Playwright CLI at ${playwrightCli}. Run npm install.`);
  process.exit(2);
}

console.log(describeSuite('regression', SUITE_REGRESSION));
console.log(
  '[internsafar-qa] Regression includes journey behavior specs + screen loads + mobile.',
);
console.log(
  '[internsafar-qa] Still not full Excel coverage — Manual/Obsolete rows remain in InternSafar-Test-Cases.xlsx.',
);
console.log(`[internsafar-qa] Live list reporter on; JSON → ${report}`);
console.log('[internsafar-qa] Hang guard: list+file JSON; direct Playwright CLI (no npx/shell nesting).');

const pw = spawnSync(process.execPath, [playwrightCli, 'test', ...SUITE_REGRESSION], {
  cwd: root,
  shell: false,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    IP_PW_JSON_REPORT: report,
  },
});

if (!existsSync(report)) {
  console.error(
    '[internsafar-qa] No JSON report written. Check IP_PW_JSON_REPORT / playwright.config.js reporters.',
  );
}

const apply = spawnSync(process.execPath, ['scripts/apply-playwright-regression-xlsx.mjs', report], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

try {
  const audit = spawnSync('python', ['scripts/audit-internsafar-test-cases-xlsx.py'], {
    cwd: root,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (audit.status !== 0) {
    console.warn(`[internsafar-qa] xlsx audit exited ${audit.status}`);
  }
} catch (e) {
  console.warn('[internsafar-qa] audit hint skipped:', e.message || e);
}

if (existsSync(report)) {
  try {
    const rep = JSON.parse(readFileSync(report, 'utf8'));
    const stats = rep.stats || {};
    console.log(
      `[internsafar-qa] Playwright stats: expected=${stats.expected ?? '?'} unexpected=${stats.unexpected ?? '?'} skipped=${stats.skipped ?? '?'}`,
    );
  } catch {
    /* ignore */
  }
}

if (pw.status !== 0) {
  console.error(`Playwright exited ${pw.status}`);
}
process.exit(pw.status === 0 && apply.status === 0 ? 0 : 1);
