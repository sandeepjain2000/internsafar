/**
 * After Playwright regression, merge JSON results into qa-results.json (byTcId)
 * and apply onto InternSafar-Test-Cases.xlsx.
 *
 *   node scripts/apply-playwright-regression-xlsx.mjs [path-to-playwright-json]
 *
 * Default report: test-results/regression-results.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const resultsPath = resolve(root, 'test-cases/qa-results.json');
const reportPath = resolve(
  root,
  process.argv[2] || 'test-results/regression-results.json',
);

/** Playwright test title substring → TC-IS id(s) */
const TITLE_TO_TC = [
  [/IS-001/, ['TC-IS-01-001']],
  [/IS-002/, ['TC-IS-01-002']],
  [/IS-003|no Google sign-in button|home has email\/password login and no Google/, ['TC-IS-18-030']],
  [/IS-004b|GoogleLoginDisabled/, ['TC-IS-02-025']],
  [/IS-004\b|GoogleAccountNotLinked/, ['TC-IS-02-025']],
  [/IS-005|candidate register Google control/, ['TC-IS-03-005']],
  [/IS-006|IS-009/, ['TC-IS-02-001']],
  [/IS-007/, ['TC-IS-02-001']],
  [/IS-008/, ['TC-IS-02-015']],
  [/IS-011/, ['TC-IS-18-039']],
  [/IS-012/, ['TC-IS-18-040']],
  [/IS-017/, ['TC-IS-18-046']],
  [/IS-018|IS-020/, ['TC-IS-18-042']],
  [/IS-019/, ['TC-IS-18-043']],
  [/IS-022/, ['TC-IS-18-045']],
  [/IS-024/, ['TC-IS-02-001']],
  [/IS-025/, ['TC-IS-02-001']],
  [/IS-026/, ['TC-IS-02-015']],
  [/IS-028/, ['TC-IS-04-007']],
  [/IS-057/, ['TC-IS-04-007']],
  [/IS-030/, ['TC-IS-01-004']],
  [/IS-031/, ['TC-IS-01-005']],
  [/IS-037/, ['TC-IS-01-007']],
  [/IS-038/, ['TC-IS-04-001']],
  [/IS-039/, ['TC-IS-18-041']],
  [/IS-040/, ['TC-IS-18-044']],
  [/IS-041/, ['TC-IS-07-007']],
  [/IS-055|unsubscribe page/, ['TC-IS-18-047']],
  [/IS-061|JOURNEY-CAND-01|Report listing|Report control/, ['TC-IS-07-022']],
  [/IS-062|Save draft/, ['TC-IS-06-010']],
  [/IS-063|JOURNEY-EMP-01|Action center|required asterisks/, ['TC-IS-09-017', 'TC-IS-09-015']],
  [/IS-064|start date|JOURNEY-CAND-02/, ['TC-IS-07-023']],
  [/JOURNEY-EMP-02|postings list/, ['TC-IS-09-017']],
  [/JOURNEY-SA-01|same-status publish|skips change/, ['TC-IS-14-023']],
  [/candidate register Google reaches Google OAuth|matching redirect_uri/, ['TC-IS-02-024', 'TC-IS-18-030']],
  [/candidate register Google/, ['TC-IS-03-005']],
  [/Credentials login still works/, ['TC-IS-02-026']],
];

/** openpyxl rejects control chars / ANSI from Playwright failure dumps */
function sanitizeExcelText(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .slice(0, 500);
}

function statusFromPw(result) {
  if (result === 'passed' || result === 'expected') return 'Pass';
  if (result === 'flaky') return 'Pass';
  if (result === 'skipped') return 'Blocked';
  return 'Fail';
}

function collectSpecs(node, out = []) {
  if (!node) return out;
  if (node.specs) {
    for (const spec of node.specs) {
      out.push(spec);
    }
  }
  if (node.suites) {
    for (const s of node.suites) collectSpecs(s, out);
  }
  return out;
}

function main() {
  if (!existsSync(reportPath)) {
    console.error(`Missing Playwright JSON report: ${reportPath}`);
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const specs = collectSpecs(report);
  const byTcId = {};
  const executedAt = new Date().toISOString();

  for (const spec of specs) {
    const title = spec.title || '';
    const last = (spec.tests || [])[0]?.results?.slice(-1)[0];
    const st = statusFromPw(last?.status || (spec.ok ? 'passed' : 'failed'));
    const actual = sanitizeExcelText(
      last?.error?.message
        ? last.error.message
        : st === 'Pass'
          ? 'Playwright regression passed'
          : `Playwright ${last?.status || 'failed'}`,
    );
    for (const [re, ids] of TITLE_TO_TC) {
      if (!re.test(title)) continue;
      for (const id of ids) {
        // Prefer Fail over prior Pass in same run
        if (byTcId[id]?.status === 'Fail') continue;
        byTcId[id] = { status: st, actual: sanitizeExcelText(`${title}: ${actual}`) };
      }
    }
  }

  let prior = {};
  try {
    prior = JSON.parse(readFileSync(resultsPath, 'utf8'));
  } catch {
    /* first */
  }
  const payload = {
    executedAt,
    base: prior.base || process.env.IP_BASE || 'http://localhost:3000',
    cases: prior.cases || {},
    byTcId: { ...(prior.byTcId || {}), ...byTcId },
    results: { ...(prior.results || prior.cases || {}), ...(prior.byTcId || {}), ...byTcId },
    source: 'playwright-regression',
  };
  writeFileSync(resultsPath, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ mergedTcIs: Object.keys(byTcId).length, ids: Object.keys(byTcId) }));

  execFileSync('python', [resolve(root, 'scripts/apply-internsafar-qa-xlsx.py')], {
    cwd: root,
    stdio: 'inherit',
  });
}

main();
