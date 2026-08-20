/**
 * Node unit tests for InternSafar workbench P0 helpers (no DB required).
 * Run: node scripts/test-ip-workbench-unit.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Dynamic import of ESM libs via relative paths from scripts/
const vis = await import('../src/lib/ipInternshipVisibility.js');
const vol = await import('../src/lib/ipApplicationVolume.js');
const scr = await import('../src/lib/ipScreeningQuestions.js');
const msg = await import('../src/lib/ipMessageResponseState.js');
const idn = await import('../src/lib/ipEmployerIdentity.js');
const {
  PROTECTED_ACCOUNT_EMAILS,
  assertProtectedConfigValid,
  isProtectedEmail,
  DEMO_PASSWORD,
} = require('./lib/ipCoreSampleConfig.js');

assertProtectedConfigValid();
assert.ok(PROTECTED_ACCOUNT_EMAILS.includes('placementhubsupport@gmail.com'));
assert.ok(PROTECTED_ACCOUNT_EMAILS.includes('lawsonlclintern+1@gmail.com'));
assert.ok(PROTECTED_ACCOUNT_EMAILS.includes('shreekar.nyayapathi23+2@vit.edu'));
assert.ok(isProtectedEmail('placementhubsupport@gmail.com'));
assert.ok(!isProtectedEmail('random@example.com'));
assert.equal(DEMO_PASSWORD, 'Admin@123');

// Visibility
const now = new Date('2026-06-01T12:00:00Z');
assert.equal(
  vis.isCandidateAccessible({ status: 'published', starts_at: '2026-07-01T00:00:00Z' }, now),
  false,
);
assert.equal(
  vis.isCandidateAccessible({ status: 'published', starts_at: '2026-05-01T00:00:00Z', apply_ends_at: '2026-05-15T00:00:00Z' }, now),
  false,
);
assert.equal(
  vis.isCandidateAccessible({ status: 'published', starts_at: '2026-05-01T00:00:00Z', apply_ends_at: '2026-07-01T00:00:00Z' }, now),
  true,
);
assert.equal(vis.deriveLifecycleLabel({ status: 'published', starts_at: '2026-07-01T00:00:00Z' }, now), 'Scheduled');
assert.equal(vis.deriveLifecycleLabel({ status: 'draft' }, now), 'Draft');
assert.equal(
  vis.deriveLifecycleLabel({
    status: 'published',
    starts_at: '2026-05-01T00:00:00Z',
    apply_ends_at: '2026-06-02T00:00:00Z',
  }, now),
  'Closing soon',
);

const mcq = await import('../src/lib/ipMcqAnalytics.js');
const summary = mcq.summarizeMcqResponses(
  [{ id: 'q1', prompt: 'City?', type: 'mcq', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', disablesApplication: true }] }],
  [{ answers: { q1: 'a' } }, { answers: { q1: 'a' } }, { answers: { q1: 'b' } }],
);
assert.equal(summary[0].options[0].count, 2);
assert.equal(summary[0].options[0].percent, 67);
assert.ok(mcq.applicationsToCsv([{ id: '1', name: 'Priya', status: 'applied' }]).includes('application_id'));
assert.ok(mcq.applicationsToCsv([{ id: '1', name: 'Priya', status: 'applied' }]).includes('Priya'));

const sched = vis.validateScheduleFields({
  startsAt: '2026-07-01T00:00:00Z',
  applyEndsAt: '2026-06-01T00:00:00Z',
  isNewSchedule: true,
  now,
});
assert.ok(sched.errors.length > 0);

// Volume
assert.equal(vol.publicApplicationVolumeLabel(55), '50+');
assert.equal(vol.publicApplicationVolumeLabel(120), '100+');
assert.equal(vol.publicApplicationVolumeLabel(2500), '2,000+');
assert.equal(vol.publicApplicationVolumeLabel(10), null);
assert.ok(String(vol.publicApplicationVolumeLabel(500)).endsWith('+'));

// Screening MCQ + generic disable
const qs = scr.normalizeScreeningQuestions([
  {
    prompt: 'City?',
    type: 'mcq',
    required: true,
    options: [
      { id: 'a', label: 'A', disablesApplication: false },
      { id: 'b', label: 'B', disablesApplication: true },
    ],
    disableApplicationOnAnswers: true,
    disableTriggerOptionIds: ['b'],
  },
]);
assert.equal(qs.length, 1);
assert.equal(qs[0].type, 'mcq');
const dis = scr.evaluateScreeningDisable(qs, { [qs[0].id]: 'b' });
assert.equal(dis.disabled, true);
const ok = scr.evaluateScreeningDisable(qs, { [qs[0].id]: 'a' });
assert.equal(ok.disabled, false);
// Do not infer from text
const collegeQ = scr.normalizeScreeningQuestions([
  {
    prompt: 'Are you from IIT?',
    type: 'mcq',
    options: [
      { id: 'y', label: 'Yes' },
      { id: 'n', label: 'No' },
    ],
  },
]);
assert.equal(scr.evaluateScreeningDisable(collegeQ, { [collegeQ[0].id]: 'n' }).disabled, false);

const optionalCheck = scr.validateScreeningAnswers(
  [{ id: 'q1', prompt: 'x', type: 'text', required: false }],
  {},
);
assert.equal(optionalCheck.ok, true);

// Message response state
const employer = 'emp1';
const messages = [
  { sender_user_id: 'cand1', sent_at: '2026-01-01T10:00:00Z', read_at: null },
  { sender_user_id: 'emp1', sent_at: '2026-01-01T11:00:00Z', read_at: null },
];
assert.equal(msg.threadHasUnreadForEmployer(messages, employer), true);
assert.equal(msg.threadIsRespondedByEmployer(messages, employer), true);
const unreadOnly = [
  { sender_user_id: 'cand1', sent_at: '2026-01-01T10:00:00Z', read_at: null },
];
assert.equal(msg.threadIsRespondedByEmployer(unreadOnly, employer), false);
const readButUnresponded = [
  { sender_user_id: 'cand1', sent_at: '2026-01-01T10:00:00Z', read_at: '2026-01-01T10:05:00Z' },
];
assert.equal(msg.threadHasUnreadForEmployer(readButUnresponded, employer), false);
assert.equal(msg.threadIsRespondedByEmployer(readButUnresponded, employer), false);

assert.equal(
  msg.personalizeMessageBody('Hi {{candidate_first_name}} — {{internship_title}}', {
    candidateName: 'Priya Sharma',
    internshipTitle: 'SWE Intern',
  }),
  'Hi Priya — SWE Intern',
);

assert.equal(idn.maskEmployerName('Acme', false), 'Confidential employer');
assert.equal(idn.maskEmployerName('Acme', true), 'Acme');

// Export job thresholds (§3.10)
const exp = await import('../src/lib/ipApplicantExportPolicy.js');
assert.equal(exp.shouldUseBackgroundJob(['a', 'b', 'c', 'd'], true), true);
assert.equal(exp.shouldUseBackgroundJob(['a', 'b'], false), false);
assert.equal(exp.shouldUseBackgroundJob(Array.from({ length: 16 }, (_, i) => String(i)), false), true);

console.log('OK: all workbench unit assertions passed');
