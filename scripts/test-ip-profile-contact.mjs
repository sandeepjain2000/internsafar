/**
 * Unit checks for candidate profile link / handle rules (src/lib/ipProfileContact.js).
 *   npm run test:profile-contact
 */
import assert from 'node:assert/strict';
import { registerAppAlias } from './lib/registerAppAlias.mjs';

registerAppAlias();

const {
  contactFieldError,
  firstContactFieldError,
  normalizeContactField,
  normalizeContactFields,
} = await import('../src/lib/ipProfileContact.js');

const ok = (field, value, dial = '+91') => assert.equal(contactFieldError(field, value, dial), null, `${field} should accept "${value}"`);
const bad = (field, value, re, dial = '+91') =>
  assert.match(contactFieldError(field, value, dial) || '', re, `${field} should reject "${value}"`);

for (const v of [
  'https://www.linkedin.com/in/priya-rao',
  'linkedin.com/in/priya-rao/',
  'http://in.linkedin.com/in/priya',
  'https://www.linkedin.com/mwlite/in/priya',
  'https://www.linkedin.com/pub/priya-rao/1/2/3',
  '',
]) ok('linkedin_url', v);
for (const v of [
  'https://lnkd.in/abc',
  'https://www.linkedin.com/company/acme',
  'https://www.linkedin.com/feed/',
  'linkedin/priya',
  'priya-rao',
  'https://notlinkedin.com/in/priya',
  'javascript:alert(1)',
]) bad('linkedin_url', v, /LinkedIn profile link/);

for (const field of ['github_url', 'portfolio_url', 'personal_website']) {
  for (const v of ['https://github.com/priya', 'github.com/priya', 'priya.dev', 'http://priya.in/work?x=1', '']) ok(field, v);
  for (const v of ['priya', '@priya', 'javascript:alert(1)', 'ftp://priya.dev', 'https://priya dev.com', 'mailto:a@b.com', 'https://user:pw@priya.dev']) {
    bad(field, v, /must be a web link/);
  }
  bad(field, `https://priya.dev/${'a'.repeat(260)}`, /too long/);
}

for (const v of ['9876543210', '+91 98765 43210', '+1 415 555 2671', '']) ok('whatsapp_number', v);
ok('whatsapp_number', '4155552671', '+1');
for (const v of ['12345', 'abc', '98765']) bad('whatsapp_number', v, /WhatsApp number isn't valid for \+91/);

for (const v of ['@priya_rao', 'priya_rao', 'PriyaR', '']) ok('telegram_handle', v);
for (const v of ['@abc', '@1priya', 'priya rao', '@priya-rao', `@${'a'.repeat(33)}`, 'https://t.me/priya']) {
  bad('telegram_handle', v, /Telegram handle must be/);
}

assert.equal(normalizeContactField('linkedin_url', ' linkedin.com/in/priya '), 'https://linkedin.com/in/priya');
assert.equal(normalizeContactField('github_url', 'https://github.com/priya'), 'https://github.com/priya');
assert.equal(normalizeContactField('personal_website', 'not a link'), 'not a link', 'invalid stays as typed');
assert.equal(normalizeContactField('telegram_handle', 'priya_rao'), '@priya_rao');
assert.equal(normalizeContactField('telegram_handle', '@priya_rao'), '@priya_rao');
assert.equal(normalizeContactField('whatsapp_number', ' 9876543210 '), '9876543210');

const stored = { linkedin_url: 'linkedin/legacy', telegram_handle: 'x' };
assert.equal(firstContactFieldError({ linkedin_url: 'linkedin/legacy', telegram_handle: 'x' }, stored, '+91'), null, 'unchanged legacy values never block');
assert.equal(firstContactFieldError({ phone: '9876543210' }, stored, '+91'), null, 'no contact fields sent → no error');
assert.equal(firstContactFieldError({ linkedin_url: 'lnkd.in/x' }, stored, '+91')?.field, 'linkedin_url');
assert.equal(firstContactFieldError({ github_url: 'priya' }, null, '+91')?.field, 'github_url', 'no stored profile → every sent value checked');

const normalized = normalizeContactFields({ linkedin_url: 'linkedin.com/in/p', telegram_handle: 'priya_rao', phone: ' 1 ' });
assert.equal(normalized.linkedin_url, 'https://linkedin.com/in/p');
assert.equal(normalized.telegram_handle, '@priya_rao');
assert.equal(normalized.phone, ' 1 ', 'non-contact fields untouched');
assert.equal('github_url' in normalized, false, 'fields not sent stay absent');

console.log('ipProfileContact: LinkedIn, web links, WhatsApp, Telegram, normalize + changed-only checks — all passed');
