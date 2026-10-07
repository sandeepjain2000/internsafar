/**
 * Unit tests for unsubscribe request collection (no live DB / SMTP).
 * Run: node scripts/test-ip-email-unsubscribe.mjs
 */
import assert from 'assert';
import { registerAppAlias } from './lib/registerAppAlias.mjs';

registerAppAlias({
  stubs: {
    '@/lib/db': 'data:text/javascript,export async function query(){throw new Error("no database in unit test")}',
  },
});

const format = await import('../src/lib/ipEmailUnsubscribeFormat.js');
const unsub = await import('../src/lib/ipEmailUnsubscribe.js');

class UniqueViolation extends Error {
  constructor(message) {
    super(message);
    this.code = '23505';
  }
}

function createMemoryDb() {
  const tokensByEmail = new Map();
  const tokensByToken = new Map();
  const requests = [];

  return {
    tokensByEmail,
    tokensByToken,
    requests,
    async query(sql, params = []) {
      const text = String(sql);
      if (
        /CREATE TABLE/i.test(text)
        || /CREATE UNIQUE INDEX/i.test(text)
        || /CREATE INDEX/i.test(text)
        || /DO \$\$/i.test(text)
        || /ALTER TABLE ip_email_unsubscribe_requests ADD COLUMN IF NOT EXISTS/i.test(text)
      ) {
        return { rows: [] };
      }

      if (/UPDATE ip_email_unsubscribe_requests\s+SET status = \$2/i.test(text)) {
        const [ids, status, processedBy, fromStatus] = params;
        let rowCount = 0;
        for (const r of requests) {
          if (ids.includes(r.id) && r.status === fromStatus) {
            Object.assign(r, { status, processed_at: new Date(), processed_by: processedBy });
            rowCount += 1;
          }
        }
        return { rows: [], rowCount };
      }

      if (/SELECT 1 FROM ip_email_unsubscribe_requests WHERE email = \$1 AND status = \$2/i.test(text)) {
        const [mail, status] = params;
        return { rows: requests.some((r) => r.email === mail && r.status === status) ? [{ '?column?': 1 }] : [] };
      }

      if (/FROM ip_email_unsubscribe_tokens WHERE email = \$1/i.test(text)) {
        const row = tokensByEmail.get(params[0]);
        return { rows: row ? [row] : [] };
      }

      if (/FROM ip_email_unsubscribe_tokens WHERE token = \$1/i.test(text)) {
        const row = tokensByToken.get(params[0]);
        return { rows: row ? [row] : [] };
      }

      if (/INSERT INTO ip_email_unsubscribe_tokens/i.test(text)) {
        const [id, email, token] = params;
        if (tokensByEmail.has(email) || tokensByToken.has(token)) {
          throw new UniqueViolation('duplicate token/email');
        }
        const row = { id, email, token, created_at: new Date() };
        tokensByEmail.set(email, row);
        tokensByToken.set(token, row);
        return { rows: [row] };
      }

      if (/FROM ip_email_unsubscribe_requests/i.test(text) && /WHERE status = \$1/i.test(text) && /token = \$2 OR email = \$3/i.test(text)) {
        const [status, token, email] = params;
        const row = requests.find(
          (r) => r.status === status && (r.token === token || r.email === email),
        );
        return { rows: row ? [row] : [] };
      }

      if (/FROM ip_email_unsubscribe_requests/i.test(text) && /WHERE token = \$1 OR \(email = \$2 AND status = \$3\)/i.test(text)) {
        const [token, email, status] = params;
        const row = requests.find((r) => r.token === token || (r.email === email && r.status === status));
        return { rows: row ? [row] : [] };
      }

      if (/INSERT INTO ip_email_unsubscribe_requests/i.test(text)) {
        const [id, email, token, status] = params;
        if (requests.some((r) => r.token === token)) throw new UniqueViolation('duplicate token');
        if (requests.some((r) => r.email === email && r.status === 'PENDING') && status === 'PENDING') {
          throw new UniqueViolation('duplicate pending email');
        }
        const row = { id, email, token, status, requested_at: new Date() };
        requests.push(row);
        return { rows: [row] };
      }

      if (/FROM ip_email_unsubscribe_requests/i.test(text) && /WHERE status = \$1/i.test(text) && /ORDER BY requested_at ASC/i.test(text)) {
        const [status, limit] = params;
        const rows = requests.filter((r) => r.status === status).slice(0, limit);
        return { rows };
      }

      throw new Error(`unexpected sql: ${text}`);
    },
  };
}

// --- format / token ----------------------------------------------------------
const token = format.createUnsubscribeToken();
assert.equal(format.isValidUnsubscribeToken(token), true);
assert.ok(!token.includes('@'));
assert.equal(format.isValidUnsubscribeToken(''), false);
assert.equal(format.isValidUnsubscribeToken('short'), false);
assert.equal(format.isValidUnsubscribeToken('user@example.com'), false);
assert.equal(format.normalizeUnsubscribeEmail('  A@B.COM '), 'a@b.com');
assert.equal(format.normalizeUnsubscribeEmail('nope'), '');

const url = format.buildUnsubscribeUrl('https://internsafar.example', token);
assert.ok(url.startsWith('https://internsafar.example/unsubscribe?token='));
assert.ok(!url.toLowerCase().includes('a@b.com'));
assert.ok(!url.includes('@'));

const htmlDoc = format.appendUnsubscribeHtml('<!doctype html><html><body><p>Hi</p></body></html>', url);
assert.match(htmlDoc, /<a href="[^"]+"[^>]*>unsubscribe<\/a>/);
assert.ok(htmlDoc.includes(`${format.unsubscribeHtmlFooter(url)}</body>`));

const htmlFrag = format.appendUnsubscribeHtml('<p>Offer letter</p>', url);
assert.ok(htmlFrag.startsWith('<p>Offer letter</p>'));
assert.match(htmlFrag, />unsubscribe<\/a>/);

const text = format.appendUnsubscribeText('Hello', url);
assert.match(text, /\bunsubscribe:/);
assert.ok(text.includes(url));

const wrapped = format.applyUnsubscribeFooter({ html: '<p>Body</p>', text: 'Body' }, url);
assert.match(wrapped.html, /<a href="[^"]+"[^>]*>unsubscribe<\/a>/);
assert.ok(wrapped.text.includes('unsubscribe:'));

assert.deepEqual(format.decideUnsubscribeRecord({ tokenRow: null }), {
  action: 'reject',
  reason: 'invalid_token',
});
assert.equal(
  format.decideUnsubscribeRecord({ tokenRow: { email: 'a@b.com' }, existingPending: null }).action,
  'create',
);
assert.equal(
  format.decideUnsubscribeRecord({
    tokenRow: { email: 'a@b.com' },
    existingPending: { id: '1' },
  }).action,
  'reuse',
);

// --- persistence with in-memory db ------------------------------------------
const db = createMemoryDb();
const email = 'Candidate@Example.com';
const first = await unsub.getOrCreateUnsubscribeToken(email, undefined, db);
const second = await unsub.getOrCreateUnsubscribeToken(email, format.createUnsubscribeToken(), db);
assert.equal(first, second, 'same recipient reuses the stored token');
assert.equal(unsub.isValidUnsubscribeToken(first), true);

const link = await unsub.getUnsubscribeUrlForEmail(email, undefined, db);
assert.ok(!link.toLowerCase().includes('candidate@example.com'));
assert.ok(link.includes(first));

const invalid = await unsub.recordUnsubscribeRequest('not-a-token', db);
assert.equal(invalid.ok, false);
assert.equal(invalid.reason, 'invalid_token');

const missing = await unsub.recordUnsubscribeRequest(format.createUnsubscribeToken(), db);
assert.equal(missing.ok, false);

const created = await unsub.recordUnsubscribeRequest(first, db);
assert.equal(created.ok, true);
assert.equal(created.duplicate, false);
assert.equal(created.status, 'PENDING');
assert.equal(created.email, 'candidate@example.com');
assert.equal(created.token, first);

const again = await unsub.recordUnsubscribeRequest(first, db);
assert.equal(again.ok, true);
assert.equal(again.duplicate, true);
assert.equal(again.id, created.id);
assert.equal(db.requests.length, 1, 'same link must not insert a second pending row');

const pending = await unsub.listPendingUnsubscribeRequests({}, db);
assert.equal(pending.length, 1);
assert.equal(pending[0].status, 'PENDING');
assert.equal(pending[0].email, 'candidate@example.com');

assert.equal(await unsub.isEmailUnsubscribed(email, db), false, 'pending request does not stop mail yet');
assert.equal(await unsub.markUnsubscribeRequestsProcessed([], 'sa-1', db), 0);
assert.equal(await unsub.markUnsubscribeRequestsProcessed([created.id, created.id], 'sa-1', db), 1);
assert.equal(db.requests[0].status, 'PROCESSED');
assert.equal(db.requests[0].processed_by, 'sa-1');
assert.equal(await unsub.markUnsubscribeRequestsProcessed([created.id], 'sa-1', db), 0, 'already processed');
assert.equal(await unsub.isEmailUnsubscribed('CANDIDATE@example.com', db), true, 'processed address stops mail');
assert.equal(await unsub.isEmailUnsubscribed('not-an-email', db), false);

const nonePending = await unsub.listPendingUnsubscribeRequests({}, db);
assert.equal(nonePending.length, 0);
const processed = await unsub.listUnsubscribeRequests({ status: 'PROCESSED' }, db);
assert.equal(processed.length, 1);
assert.ok(processed[0].processedAt, 'processed row exposes processedAt');

await assert.rejects(
  () => unsub.listUnsubscribeRequests({ status: 'NOPE' }, db),
  /invalid status/,
);

console.log('OK: unsubscribe tokens, footer, pending-request de-dupe, pending list, and SuperAdmin processing');
