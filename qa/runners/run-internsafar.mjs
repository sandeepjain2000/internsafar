#!/usr/bin/env node
/**
 * InternSafar Playwright runner (not Placement Hub qa/runners).
 *   npm run qa:e2e
 *   node qa/runners/run-internsafar.mjs
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const child = spawn('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 1));
