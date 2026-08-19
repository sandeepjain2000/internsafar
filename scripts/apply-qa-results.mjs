/**
 * Apply QA JSON (stdout from run-sheet* or run-ip-checklist-qa) to the manual checklist xlsx.
 * Maps legacy TC-IP-* ids to new checklist ids when present in legacyTcIdMap.mjs.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { LEGACY_TC_MAP } from './lib/legacyTcIdMap.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const outPath = resolve(appRoot, 'test-cases/qa-results.json');

function readPayload() {
  const arg = process.argv[2];
  if (arg && arg !== '--stdin') {
    const p = resolve(process.cwd(), arg);
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  if (process.stdin.isTTY) {
    console.error('Usage: node scripts/apply-qa-results.mjs <results.json> | pipe JSON stdin');
    process.exit(1);
  }
  const raw = readFileSync(0, 'utf8');
  const start = raw.indexOf('{');
  return JSON.parse(raw.slice(start >= 0 ? start : 0));
}

function mapCases(rawCases) {
  const out = {};
  for (const [id, row] of Object.entries(rawCases || {})) {
    const mapped = LEGACY_TC_MAP[id] || id;
    out[mapped] = row;
  }
  return out;
}

function mergePayload(data) {
  const executedAt = data.executedAt || new Date().toISOString();
  const merged = {};

  if (data.batches) {
    for (const batch of data.batches) {
      Object.assign(merged, mapCases(batch.cases));
    }
  } else if (data.cases) {
    Object.assign(merged, mapCases(data.cases));
  } else {
    Object.assign(merged, mapCases(data));
  }

  return { executedAt, cases: merged };
}

function main() {
  const payload = mergePayload(readPayload());
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  const py = resolve(appRoot, 'scripts/ip_checklist_xlsx.py');
  execFileSync('python', [py, outPath], { cwd: appRoot, stdio: 'inherit' });
  const pass = Object.values(payload.cases).filter((c) => c.status === 'Pass').length;
  const fail = Object.values(payload.cases).filter((c) => c.status === 'Fail').length;
  console.log(
    JSON.stringify({
      applied: Object.keys(payload.cases).length,
      pass,
      fail,
      checklist: 'test-cases/Internship_Portal_Test_Checklist.xlsx',
    }),
  );
}

main();
