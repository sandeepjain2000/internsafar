/**
 * Thin alias — combined InternSafar QA lives in run-internsafar-qa.mjs.
 * Kept so old npm scripts / docs that call run-ip-checklist-qa still work.
 */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, 'run-internsafar-qa.mjs');
const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
