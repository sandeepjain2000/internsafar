/**
 * Pin Playwright browsers to a stable user folder so Cursor sandbox temp caches
 * do not force a re-download every session.
 *
 * Default: %LOCALAPPDATA%/ms-playwright (Windows) or ~/.cache/ms-playwright
 */
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

export function defaultPlaywrightBrowsersPath() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
    return join(local, 'ms-playwright');
  }
  return join(homedir(), '.cache', 'ms-playwright');
}

/** Set env before any playwright/chromium.launch import side effects matter. */
export function ensurePlaywrightBrowsersPath() {
  const dir = defaultPlaywrightBrowsersPath();
  process.env.PLAYWRIGHT_BROWSERS_PATH = dir;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return dir;
}

// Side-effect: pin path as soon as this module is imported (before chromium.launch).
ensurePlaywrightBrowsersPath();


function chromiumLooksInstalled(browsersPath) {
  // Headless launch needs chromium_headless_shell (Playwright 1.49+).
  // Version folder names change with Playwright releases — accept any match.
  try {
    const names = readdirSync(browsersPath);
    if (names.some((n) => String(n).startsWith('chromium_headless_shell-'))) return true;
    if (names.some((n) => String(n).startsWith('chromium-'))) return true;
  } catch {
    /* missing dir */
  }
  const markers = [
    join(browsersPath, 'chromium_headless_shell-1234'),
    join(browsersPath, 'chromium_headless_shell-1169'),
  ];
  return markers.some((p) => existsSync(p));
}

/**
 * Install Chromium into the persistent browsers path if missing.
 * @param {{ force?: boolean }} opts
 */
export function installPlaywrightBrowsersIfNeeded(opts = {}) {
  const dir = ensurePlaywrightBrowsersPath();
  if (!opts.force && chromiumLooksInstalled(dir)) {
    console.log(`[playwright] browsers already present at ${dir}`);
    return { ok: true, path: dir, installed: false };
  }
  console.log(`[playwright] installing chromium into ${dir} …`);
  const cli = resolve(ROOT, 'node_modules/playwright/cli.js');
  // shell:false — Windows "Program Files" path breaks when shell concatenates.
  const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
    cwd: ROOT,
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dir },
    stdio: 'inherit',
    shell: false,
  });
  if (r.status !== 0) {
    throw new Error(`playwright install failed with status ${r.status}`);
  }
  return { ok: true, path: dir, installed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--force');
  installPlaywrightBrowsersIfNeeded({ force });
  try {
    const { chromium } = require('playwright');
    ensurePlaywrightBrowsersPath();
    console.log('[playwright] executable:', chromium.executablePath());
  } catch (e) {
    console.warn('[playwright] could not resolve executablePath:', e.message);
  }
}
