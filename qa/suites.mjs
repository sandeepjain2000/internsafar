/**
 * InternSafar Playwright suite definitions (single source of truth).
 *
 * Industry-aligned tiers:
 * - Smoke: critical auth/home paths — fast gate (minutes)
 * - smoke-latest: compat alias for former ~47 pack (auth + google + IS-*)
 * - Regression: smoke-latest + journey specs + role screen loads + mobile
 * - Full: every file under qa/tests/
 *
 * Honest note: Excel InternSafar-Test-Cases.xlsx still holds Manual cases.
 * Playwright pass count ≠ full workbook.
 */
export const SUITE_SMOKE = [
  'qa/tests/auth.spec.js',
  'qa/tests/google-auth.spec.js',
];

/** Previous default (~47 tests) — auth + google + IS-* latest-update pack only. */
export const SUITE_SMOKE_LATEST = [
  ...SUITE_SMOKE,
  'qa/tests/regression.spec.js',
];

/**
 * Product regression: behavior journeys + breadth screen loads + mobile.
 */
export const SUITE_REGRESSION = [
  ...SUITE_SMOKE_LATEST,
  'qa/tests/journeys-candidate.spec.js',
  'qa/tests/journeys-employer.spec.js',
  'qa/tests/journeys-superadmin.spec.js',
  'qa/tests/screens.spec.js',
  'qa/tests/mobile-candidate-internships.spec.js',
];

/** All Playwright specs under qa/tests. */
export const SUITE_FULL = [
  'qa/tests/auth.spec.js',
  'qa/tests/google-auth.spec.js',
  'qa/tests/regression.spec.js',
  'qa/tests/journeys-candidate.spec.js',
  'qa/tests/journeys-employer.spec.js',
  'qa/tests/journeys-superadmin.spec.js',
  'qa/tests/screens.spec.js',
  'qa/tests/mobile-candidate-internships.spec.js',
];

/**
 * AWS production Linux — same files as regression.
 * Runner `qa:e2e:aws` sets IP_BASE / bundled Chromium / skip ops probes.
 * Prefer this over full:release against live RDS.
 */
export const SUITE_AWS_REGRESSION = [...SUITE_REGRESSION];

export const SUITE_BY_NAME = {
  smoke: SUITE_SMOKE,
  'smoke-latest': SUITE_SMOKE_LATEST,
  regression: SUITE_REGRESSION,
  'aws-regression': SUITE_AWS_REGRESSION,
  full: SUITE_FULL,
};

export function describeSuite(name, files) {
  const n = files.length;
  return `[internsafar-qa] suite=${name} specs=${n} files:\n${files.map((f) => `  - ${f}`).join('\n')}`;
}
