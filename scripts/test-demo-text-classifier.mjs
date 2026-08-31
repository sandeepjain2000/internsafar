#!/usr/bin/env node
/**
 * Guards the demo-text gate against being greedy.
 *
 * The gate exists to catch two things: duplicated/generated placeholder wording
 * and random ids leaked into prose (`lhljn7g6`). It must NOT flag legitimate
 * product vocabulary. "QA" is a job function, "Gen AI" is a field, tests have
 * coverage, hardware has fixtures. An earlier version matched the bare word
 * "qa", which pushed a real job title ("QA Automation") out of the demo pool to
 * keep the gate quiet — the tail wagging the dog. These cases stop that
 * happening again.
 *
 *   node scripts/test-demo-text-classifier.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { classifyDemoText, classifyEntityName } = require('./lib/ipDemoTextQuality.js');

/** Real copy — must all be accepted. */
const MUST_PASS = [
  // The exact class the gate used to get wrong.
  'QA Automation Intern',
  'QA Automation Intern — Platform',
  'Manual QA Intern',
  'QA Engineer Intern — Core Product',
  'Software Testing Intern',
  'Gen AI Intern',
  'Gen AI Research Intern — Innovation Lab',
  // Ordinary sentences containing the same words.
  'You will work alongside the QA team to raise release confidence.',
  'Improve automated test coverage across the checkout flow.',
  'Write test coverage reports for the payments service.',
  'Design a test fixture for the sensor assembly line.',
  'Assemble lighting fixtures and document the wiring.',
  'Run a sample survey of 200 students and analyse the responses.',
  'Present your work at demo day in front of the leadership team.',
  'Build dummy variables for the regression model.',
  // Real technology names that mix letters and digits.
  'Comfortable with Bootstrap5 and Tailwind4 utility classes.',
  'Experience with PostgreSQL16 and Next15 App Router.',
  'Worked on COVID19 dashboards during the internship.',
  'Knowledge of HTML5, ES6 and Python3 fundamentals.',
  // Prose that happens to contain a harness noun AND a marker word. A real
  // seeded message was flagged for exactly this before the length guard.
  'Thanks for the note — I will send a sample of my earlier work by Thursday evening.',
  'Please note the sample dataset is attached to the previous message in this thread.',
  'I have added a note on your account and shared a demo of the dashboard.',
  // Normal seeded copy from the demo pool.
  'Frontend Developer Intern — Growth',
  'Electronics Hardware Intern — Core Product',
  'Nova Labs',
  'Priya Sharma',
  'Final-year or recent graduate. Comfortable with the fundamentals of backend developer work.',
];

/** Generator wording and leaked ids — must all be caught. */
const MUST_FLAG = [
  // Random ids in prose, the original complaint.
  ['lhljn7g6', 'jumble'],
  ['QA Idea mt140t02xc0e', 'jumble'],
  ['Coverage role x7f3k9q2', 'jumble'],
  ['QA idea 1786356065134', 'jumble'],
  // Machine-composed titles and entity wording.
  ['QA Published Internship', 'scaffolding'],
  ['QA Screening Internship', 'scaffolding'],
  ['Pending Co', 'scaffolding'],
  ['hello from QA employer', 'scaffolding'],
  ['QA rating', 'scaffolding'],
  ['QA Feature Idea', 'scaffolding'],
  ['QA Automation Doc', 'scaffolding'],
  ['Coverage view', 'scaffolding'],
  ['Gen College', 'scaffolding'],
  ['Gen Co 0', 'scaffolding'],
  ['Coverage role 3', 'scaffolding'],
  ['Need fixture coverage', 'scaffolding'],
  ['CoreFill employer 2', 'scaffolding'],
  // All three spellings of the same generator prefix, plus its stock phrasing.
  ['Core-fill: you have new application activity', 'scaffolding'],
  ['Core Fill Polite Decline', 'scaffolding'],
  ['Core-fill posting for tab visibility demos.', 'scaffolding'],
  ['Demo notification so the Notifications tab is not empty.', 'scaffolding'],
  ['Demo accounts are ready for review.', 'scaffolding'],
  ['Lorem ipsum dolor sit amet', 'scaffolding'],
  ['placeholder text', 'scaffolding'],
];

/**
 * Name columns only (classifyEntityName): a workflow status baked into a customer-visible
 * name. One employer was live as "Quill Content (Pending)" — the seeding status shipped
 * as part of the company name.
 */
const NAMES_MUST_FLAG = [
  'Quill Content (Pending)',
  'Aether Mobility (Draft)',
  'BluePeak Consulting [Test]',
  'Orbit Fintech - Pending',
  'Summit Cloud — Approved',
  'Forge Robotics (Copy)',
];

/** Names that merely resemble the pattern and must stay clean. */
const NAMES_MUST_PASS = [
  'Nova Labs — Pune',
  'Aether Mobility (India)',
  'Cedar Softworks (Pvt Ltd)',
  'Data Engineering Intern — Platform',
  'Harbor Bank Digital',
  'Vertex Pharma IT',
  'Draft Horse Logistics',
  'Approved Vendors Marketplace',
];

const failures = [];

for (const value of MUST_PASS) {
  const got = classifyDemoText(value);
  if (got !== null) {
    failures.push(`FALSE ALARM: ${JSON.stringify(value)} was flagged as "${got}" but is legitimate copy`);
  }
}

for (const [value, expected] of MUST_FLAG) {
  const got = classifyDemoText(value);
  if (got === null) {
    failures.push(`MISSED: ${JSON.stringify(value)} should have been flagged as "${expected}"`);
  } else if (got !== expected) {
    failures.push(`WRONG CLASS: ${JSON.stringify(value)} flagged "${got}", expected "${expected}"`);
  }
}

for (const value of NAMES_MUST_FLAG) {
  if (classifyEntityName(value) === null) {
    failures.push(`MISSED: name ${JSON.stringify(value)} carries a workflow status and should be flagged`);
  }
}

for (const value of NAMES_MUST_PASS) {
  const got = classifyEntityName(value);
  if (got !== null) {
    failures.push(`FALSE ALARM: name ${JSON.stringify(value)} was flagged as "${got}" but is a legitimate name`);
  }
}

// ---------------------------------------------------------------- catalog invariants
// Checked here so a bad edit to the catalog fails this test, rather than surfacing as a
// module-load crash the first time somebody runs a seeding script.
const catalog = require('./lib/ipCompanyCatalog.js');

const demoDupes = catalog.findDuplicates(catalog.COMPANY_CATALOG);
if (demoDupes.length) {
  failures.push(`COMPANY_CATALOG repeats a name, so two employers would share it: ${demoDupes.join(', ')}`);
}

const overlap = catalog.QA_COMPANY_CATALOG.filter(
  (n) => catalog.COMPANY_CATALOG.some((d) => d.toLowerCase() === n.toLowerCase()),
);
if (overlap.length) {
  failures.push(
    'QA_COMPANY_CATALOG overlaps the demo pool, so a QA fixture could take a demo '
    + `employer's company name and fail the duplicate gate: ${overlap.join(', ')}`,
  );
}

// The seeders must not be able to emit "X — City": migration 033 removed that shape and
// the demo-consistency gate rejects it, so generating it would fail our own gate.
let raised = false;
try {
  catalog.companyNameAt(catalog.COMPANY_CATALOG.length);
} catch {
  raised = true;
}
if (!raised) {
  failures.push(
    'companyNameAt past the end of the catalog returned a name instead of raising; '
    + 'a branch-suffix fallback would be rejected by the demo-consistency gate',
  );
}

for (const name of [...catalog.COMPANY_CATALOG, ...catalog.QA_COMPANY_CATALOG]) {
  const verdict = classifyEntityName(name);
  if (verdict !== null) {
    failures.push(`catalog name ${JSON.stringify(name)} fails our own name gate as "${verdict}"`);
  }
}

if (failures.length) {
  console.log(`FAIL: ${failures.length} case(s)\n`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log('\nFalse alarms are the worse failure: they push real product wording out of the app.');
  process.exit(1);
}

console.log(
  `OK: demo-text classifier correct on ${MUST_PASS.length} legitimate values `
  + `(incl. QA/Gen AI job titles) and ${MUST_FLAG.length} placeholder values; `
  + `name gate correct on ${NAMES_MUST_FLAG.length} status-in-name values and `
  + `${NAMES_MUST_PASS.length} lookalike names.`,
);
