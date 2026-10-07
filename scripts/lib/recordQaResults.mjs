/**
 * One place for any QA script to record workbook results.
 *
 * Merges `{ [id]: { status, actual } }` into test-cases/qa-results.json with the time each
 * result ran, so `apply-internsafar-qa-xlsx.py` writes it to InternSafar-Test-Cases.xlsx and
 * later runs (which keep other scripts' records) never date it as fresh.
 * TC-IS ids go to `byTcId`, older checklist ids (REG-E-6 …) to `cases`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESULTS_PATH = resolve(appRoot, 'test-cases/qa-results.json');
const BUCKETS = ['cases', 'byTcId', 'results'];

/**
 * @param {Record<string, { status: 'Pass'|'Fail'|'Blocked', actual: unknown }>} records
 * @param {{ source?: string }} [opts]
 */
export function recordQaResults(records, { source } = {}) {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
  } catch {
    payload = {};
  }
  for (const k of BUCKETS) payload[k] ||= {};
  if (payload.executedAt) {
    for (const k of BUCKETS) {
      for (const rec of Object.values(payload[k])) rec.executedAt ||= payload.executedAt;
    }
  }
  const executedAt = new Date().toISOString();
  payload.executedAt ||= executedAt;
  for (const [id, rec] of Object.entries(records)) {
    const entry = {
      status: rec.status,
      actual: typeof rec.actual === 'string' ? rec.actual : JSON.stringify(rec.actual ?? ''),
      executedAt,
      ...(source ? { source } : {}),
    };
    payload[id.startsWith('TC-IS-') ? 'byTcId' : 'cases'][id] = entry;
    payload.results[id] = entry;
  }
  writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2));
  console.log(`Recorded ${Object.keys(records).length} result(s) in test-cases/qa-results.json`);
}

/**
 * For scripts that cover several cases in one long flow: `begin(id)` when a case's steps start,
 * `pass(id, actual)` when its last check holds. `failOpen(reason)` marks every begun-but-unpassed
 * case Fail (call it from the script's fail path). Cases never begun are not recorded, so their
 * earlier result keeps its own date and coverage --strict still shows them as not run today.
 */
export function createCaseRecorder({ source } = {}) {
  const results = {};
  const open = new Set();
  return {
    begin(...ids) {
      for (const id of ids) open.add(id);
    },
    pass(id, actual) {
      open.delete(id);
      results[id] = { status: 'Pass', actual };
    },
    failOpen(reason) {
      for (const id of open) results[id] = { status: 'Fail', actual: `Fail: ${reason}` };
      open.clear();
    },
    flush() {
      if (Object.keys(results).length) recordQaResults(results, { source });
    },
  };
}

/** Write qa-results.json into the workbook (InternSafar-Test-Cases.xlsx + dated copy). */
export function applyQaResultsToWorkbook() {
  execFileSync('python', [resolve(appRoot, 'scripts/apply-internsafar-qa-xlsx.py')], {
    cwd: appRoot,
    stdio: 'inherit',
  });
}
