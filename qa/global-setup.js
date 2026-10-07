const { spawnSync } = require('node:child_process');
const path = require('node:path');

/**
 * Re-create / repair the disposable QA test accounts before every Playwright run, so suites keep
 * working after IP_Reset_Core_Sample.js drops them. Only for hosts on the shared local/Vercel DB;
 * other hosts (AWS) need `npm run qa:ensure-test-accounts` run against their own database.
 * Skip with IP_QA_SKIP_ENSURE_TEST_ACCOUNTS=1.
 */
module.exports = async function globalSetup() {
  if (/^(1|true)$/i.test(process.env.IP_QA_SKIP_ENSURE_TEST_ACCOUNTS || '')) return;
  const base = process.env.IP_BASE || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
  const sharedDb = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base) || /\.vercel\.app(\/|$)/i.test(base);
  if (!sharedDb) {
    console.log(`[qa] ${base} has its own database: run "npm run qa:ensure-test-accounts" on that host before testing.`);
    return;
  }
  const r = spawnSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      path.join(__dirname, '..', 'scripts', 'ensure-ip-test-accounts.mjs'),
      '--quiet',
    ],
    { stdio: 'inherit', shell: false },
  );
  if (r.status !== 0) {
    throw new Error('Could not create the QA test accounts — run "npm run qa:ensure-test-accounts" to see why.');
  }
};
