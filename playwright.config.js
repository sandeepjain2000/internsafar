const { defineConfig, devices } = require('@playwright/test');

/**
 * Local / Vercel (Windows laptop): system Chrome + optional `npm run dev` webServer.
 * AWS Linux / remote production: bundled Chromium, no webServer (PM2 already serves).
 *
 * Override:
 *   IP_BASE=https://internsafar.com
 *   PW_NO_WEBSERVER=1
 *   PW_USE_BUNDLED_CHROMIUM=1
 *   PW_WEBSERVER=1   (force webServer even on Linux)
 */
const isHeaded = process.env.PW_HEADED === '1' || process.env.PW_HEADED === 'true';
const baseURL = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const isRemoteTarget = !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseURL);

const useSystemChrome =
  process.platform === 'win32' &&
  process.env.PW_USE_BUNDLED_CHROMIUM !== '1' &&
  process.env.PW_USE_BUNDLED_CHROMIUM !== 'true';

const wantWebServer =
  process.env.PW_WEBSERVER === '1' || process.env.PW_WEBSERVER === 'true'
    ? true
    : process.env.PW_NO_WEBSERVER === '1' || process.env.PW_NO_WEBSERVER === 'true'
      ? false
      : process.platform === 'win32' && !isRemoteTarget;

const chromiumProject = {
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    ...(useSystemChrome ? { channel: 'chrome' } : {}),
  },
};

module.exports = defineConfig({
  testDir: './qa/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 1,
  workers: 1,
  reporter: process.env.IP_PW_JSON_REPORT
    ? [
        ['list'],
        ['json', { outputFile: process.env.IP_PW_JSON_REPORT }],
      ]
    : [['list']],
  timeout: isRemoteTarget ? 120_000 : 90_000,
  expect: { timeout: isRemoteTarget ? 30_000 : 20_000 },
  use: {
    baseURL,
    headless: !isHeaded,
    navigationTimeout: isRemoteTarget ? 45_000 : 30_000,
    actionTimeout: 45_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [chromiumProject],
  ...(wantWebServer
    ? {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }
    : {}),
});
