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
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

console.log(describeSuite('regression', SUITE_REGRESSION));
console.log(
  '[internsafar-qa] Regression includes journey behavior specs + screen loads + mobile.',
);
console.log(
  '[internsafar-qa] Still not full Excel coverage — Manual/Obsolete rows remain in InternSafar-Test-Cases.xlsx.',
);

const pw = spawnSync(
  'npx',
  ['playwright', 'test', ...SUITE_REGRESSION, '--reporter=json'],
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

// Honest coverage hint from last audit if present
const auditHint = resolve(root, 'test-results/xlsx-coverage-hint.txt');
try {
  const audit = spawnSync('python', ['scripts/audit-internsafar-test-cases-xlsx.py'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (audit.stdout) {
    writeFileSync(auditHint, audit.stdout);
    const m = audit.stdout.match(/"byAutomation"\s*:\s*\{[\s\S]*?\n  \}/);
    console.log('[internsafar-qa] Excel Automation breakdown (post-apply):');
    console.log(m ? m[0] : audit.stdout.slice(0, 600));
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
