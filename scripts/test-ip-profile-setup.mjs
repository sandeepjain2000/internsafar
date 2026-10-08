/**
 * Unit checks for candidate profile "Setup & hours" rules (src/lib/ipProfileSetup.js).
 *   npm run test:profile-setup
 */
import assert from 'node:assert/strict';
import { registerAppAlias } from './lib/registerAppAlias.mjs';

registerAppAlias();

const {
  MAX_COMMITMENT_NOTE_LENGTH,
  commitmentNoteError,
  firstSetupFieldError,
  hoursRangeError,
} = await import('../src/lib/ipProfileSetup.js');

for (const [from, to] of [
  ['', ''],
  ['09:00', '17:30'],
  ['00:00', '23:59'],
  ['09:00:00', '09:30'],
  ['22:00', '02:00'],
  ['18:00', '06:00'],
  ['09:00', '09:00'],
  ['09:00', ''],
  ['', '17:00'],
]) {
  assert.equal(hoursRangeError(from, to), null, `hours ${from}–${to} should pass`);
}
for (const [from, to, field, re] of [
  ['9am', '17:00', 'preferred_hours_start', /must be a time/],
  ['09:00', '25:00', 'preferred_hours_end', /must be a time/],
  ['22:00', 'late', 'preferred_hours_end', /must be a time/],
]) {
  const issue = hoursRangeError(from, to);
  assert.equal(issue?.field, field, `hours ${from}–${to} field`);
  assert.match(issue.error, re, `hours ${from}–${to} message`);
}

assert.equal(commitmentNoteError(''), null);
assert.equal(commitmentNoteError('x'.repeat(MAX_COMMITMENT_NOTE_LENGTH)), null);
assert.match(commitmentNoteError('x'.repeat(MAX_COMMITMENT_NOTE_LENGTH + 1)), /too long/);

// Changed values only: a stored bad value or long note never blocks an unrelated save.
const legacy = { preferred_hours_start: '9am', preferred_hours_end: '5pm', ongoing_commitment_note: 'y'.repeat(300) };
assert.equal(firstSetupFieldError({ ...legacy, first_name: 'Priya' }, legacy), null);
assert.equal(firstSetupFieldError({}, legacy), null);
// Changing one side re-checks the pair, including the stored other side.
assert.equal(firstSetupFieldError({ preferred_hours_end: '17:00' }, legacy)?.field, 'preferred_hours_start');
assert.equal(firstSetupFieldError({ preferred_hours_start: '22:00', preferred_hours_end: '02:00' }, legacy), null);
assert.equal(firstSetupFieldError({ preferred_hours_start: '', preferred_hours_end: '' }, legacy), null);
assert.equal(
  firstSetupFieldError({ ongoing_commitment_note: 'z'.repeat(201) }, legacy)?.field,
  'ongoing_commitment_note',
);
assert.equal(firstSetupFieldError({ ongoing_commitment_note: 'evening classes' }, legacy), null);

console.log('ipProfileSetup unit checks: OK');
