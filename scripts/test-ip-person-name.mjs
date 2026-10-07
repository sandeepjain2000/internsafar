/**
 * Unit checks for the candidate name rule (src/lib/ipPersonName.js).
 *   npm run test:person-name
 */
import assert from 'node:assert/strict';
import { firstPersonNameError, personNameError } from '../src/lib/ipPersonName.js';

const valid = [
  'Priya', 'Anne-Marie', "O'Neil", 'O’Brien', 'R. K.', 'Mary Jane', 'José', 'Zoë',
  'प्रिया', 'ராஜேஷ்', 'محمد', '李', '',
];
const invalid = ['Priya123', '123', 'Priya@', 'K2', 'Sharma_', '-Priya', "'Neil", '.R', 'Priya!', 'A/B', 'Ana+1'];

for (const name of valid) assert.equal(personNameError('First Name', name), null, `should accept "${name}"`);
for (const name of invalid) {
  assert.match(personNameError('First Name', name) || '', /^First Name can only contain letters/, `should reject "${name}"`);
}

assert.equal(firstPersonNameError({ phone: '9000000000' }), null, 'no name fields sent → no error');
assert.deepEqual(firstPersonNameError({ first_name: 'Priya', last_name: 'Rao9' })?.field, 'last_name');
assert.equal(firstPersonNameError({ first_name: 'Priya', name: 'Priya 123' }), null, 'bare name ignored when parts are sent');
assert.equal(firstPersonNameError({ name: 'Priya 123' })?.field, 'name', 'bare name checked when no parts sent');

console.log(`ipPersonName: ${valid.length} valid + ${invalid.length} invalid names + payload checks — all passed`);
