/**
 * Unit checks for the weekly employer documents reminder email (src/lib/ipEmployerDocsReminderFormat.js).
 *   npm run test:employer-docs-reminder
 */
import assert from 'node:assert/strict';
import { registerAppAlias } from './lib/registerAppAlias.mjs';

registerAppAlias();

const {
  DOCS_REMINDER_MAX_SENDS,
  DOCS_REMINDER_MIN_GAP_DAYS,
  DOCS_REMINDER_SUBJECT,
  buildEmployerDocsReminderEmail,
  isDocsReminderEnabled,
} = await import('../src/lib/ipEmployerDocsReminderFormat.js');

assert.equal(DOCS_REMINDER_MAX_SENDS, 2, 'cap is two automated reminders');
assert.ok(DOCS_REMINDER_MIN_GAP_DAYS >= 6 && DOCS_REMINDER_MIN_GAP_DAYS < 7, 'weekly gap tolerates drift');

for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
  assert.equal(isDocsReminderEnabled({ IP_EMPLOYER_DOCS_REMINDER_ENABLED: v }), true, `enabled for ${v}`);
}
for (const v of [undefined, '', 'false', '0', 'off', 'no']) {
  assert.equal(isDocsReminderEnabled({ IP_EMPLOYER_DOCS_REMINDER_ENABLED: v }), false, `off for ${v}`);
}

const full = buildEmployerDocsReminderEmail({
  contactName: 'Samantha Hurk',
  accountName: 'Ignored Name',
  companyName: 'Multitool Pri AI KIT Utilities',
  origin: 'https://internsafar.com/',
});
assert.equal(full.subject, DOCS_REMINDER_SUBJECT);
assert.match(full.text, /^Dear Samantha Hurk,/);
assert.match(full.text, /Thank you for registering Multitool Pri AI KIT Utilities on InternSafar\./);
assert.match(full.text, /Please sign in at internsafar\.com and upload one official business document/);
assert.match(full.text, /Profile → Documents/);
assert.match(full.text, /Once your account is approved, you can start posting internships straight away\./);
assert.match(full.text, /Kind regards,\nTeam InternSafar$/);
assert.match(full.html, /href="https:\/\/internsafar\.com\/"/);
assert.doesNotMatch(full.html + full.text, /zepto/i, 'no email vendor name in the message');

const accountOnly = buildEmployerDocsReminderEmail({
  contactName: '  ',
  accountName: 'Ravi Kumar',
  companyName: 'Acme',
  origin: 'https://internsafar.com',
});
assert.match(accountOnly.text, /^Dear Ravi Kumar,/, 'falls back to account name');

const companyOnly = buildEmployerDocsReminderEmail({ companyName: 'Acme Labs', origin: 'https://internsafar.com' });
assert.match(companyOnly.text, /^Dear Acme Labs team,/, 'falls back to company team');

const bare = buildEmployerDocsReminderEmail({ origin: 'https://internsafar.com' });
assert.match(bare.text, /^Hello,/);
assert.match(bare.text, /Thank you for registering your company on InternSafar\./);

const hostile = buildEmployerDocsReminderEmail({
  contactName: '<script>alert(1)</script>',
  companyName: 'Evil & "Co" <b>',
  origin: 'https://internsafar.com',
});
assert.doesNotMatch(hostile.html, /<script>|<b>/, 'names are HTML-escaped');
assert.match(hostile.html, /&lt;script&gt;/);
assert.match(hostile.html, /Evil &amp; &quot;Co&quot; &lt;b&gt;/);

console.log('test:employer-docs-reminder — all checks passed');
