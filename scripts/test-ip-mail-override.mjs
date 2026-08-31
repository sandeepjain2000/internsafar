/**
 * Node unit tests for the outbound email override gate (no DB, no SMTP).
 * Run: node scripts/test-ip-mail-override.mjs
 *
 * Contract under test (src/lib/mail.js):
 *   flag ON  (ISM_TEST_ENVIRONMENT / OUTBOUND_EMAIL_OVERRIDE_ENABLED true)
 *     -> mail goes to the real recipient AND OUTBOUND_EMAIL_OVERRIDE (support/QA
 *        inbox); the real recipient is never dropped
 *   flag OFF (unset / false / 0 / off)
 *     -> mail goes to the real user address only, even though
 *        OUTBOUND_EMAIL_OVERRIDE still holds the support address
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(here, '..');
const libDir = path.join(projectRoot, 'src', 'lib');

// mail.js uses the "@/lib/*" alias, which plain Node cannot resolve. Rewrite the
// alias to real file URLs in a throwaway copy so the tests exercise the real
// source. The copy stays inside the project so bare imports (nodemailer) resolve.
const tmpDir = fs.mkdtempSync(path.join(projectRoot, '.mail-override-test-'));
const mailSource = fs
  .readFileSync(path.join(libDir, 'mail.js'), 'utf8')
  .replace(/'@\/lib\/([^']+)'/g, (_m, name) => {
    const file = /\.[a-z]+$/i.test(name) ? name : `${name}.js`;
    return `'${pathToFileURL(path.join(libDir, file)).href}'`;
  });
const mailPath = path.join(tmpDir, 'mail.mjs');
fs.writeFileSync(mailPath, mailSource);

const mail = await import(pathToFileURL(mailPath).href);

const SUPPORT = 'support.placementhub@placementhub.online';
const REAL_USER = 'lawsonlclintern+1@gmail.com';

const FLAG_KEYS = ['ISM_TEST_ENVIRONMENT', 'OUTBOUND_EMAIL_OVERRIDE_ENABLED'];

function setEnv({ flag, overrideAddress, fallback }) {
  for (const key of FLAG_KEYS) delete process.env[key];
  delete process.env.OUTBOUND_EMAIL_OVERRIDE;
  delete process.env.IP_MAIL_TEST_FALLBACK;
  if (flag !== undefined) process.env.ISM_TEST_ENVIRONMENT = flag;
  if (overrideAddress !== undefined) process.env.OUTBOUND_EMAIL_OVERRIDE = overrideAddress;
  if (fallback !== undefined) process.env.IP_MAIL_TEST_FALLBACK = fallback;
}

// --- flag ON -> support inbox ------------------------------------------------
for (const truthy of ['true', 'TRUE', '1', 'yes', 'on']) {
  setEnv({ flag: truthy, overrideAddress: SUPPORT });
  assert.equal(mail.isOutboundEmailOverrideEnabled(), true, `flag "${truthy}" should enable override`);
  assert.equal(mail.getOutboundEmailOverride(), SUPPORT, `flag "${truthy}" should route to support`);
}

// The alias flag works the same way when ISM_TEST_ENVIRONMENT is absent.
setEnv({ overrideAddress: SUPPORT });
process.env.OUTBOUND_EMAIL_OVERRIDE_ENABLED = 'true';
assert.equal(mail.isOutboundEmailOverrideEnabled(), true);
assert.equal(mail.getOutboundEmailOverride(), SUPPORT);

// --- flag OFF -> real user address ------------------------------------------
for (const falsy of [undefined, '', 'false', '0', 'off', 'no', 'maybe']) {
  setEnv({ flag: falsy, overrideAddress: SUPPORT });
  assert.equal(mail.isOutboundEmailOverrideEnabled(), false, `flag "${falsy}" must not enable override`);
  assert.equal(
    mail.getOutboundEmailOverride(),
    null,
    `flag "${falsy}" must not redirect mail even though OUTBOUND_EMAIL_OVERRIDE is set`,
  );
  // The configured address is still readable for diagnostics; it just must not copy.
  assert.equal(mail.getConfiguredOutboundOverrideAddress(), SUPPORT);
}

// --- override address unusable -> never routes ------------------------------
for (const disabled of ['0', 'off', 'false', '', 'not-an-email']) {
  setEnv({ flag: 'true', overrideAddress: disabled });
  assert.equal(mail.getOutboundEmailOverride(), null, `override "${disabled}" must not be used as a recipient`);
}

// --- failure-only fallback ---------------------------------------------------
// Flag off + no explicit fallback: a failed send must not silently go to support.
setEnv({ overrideAddress: SUPPORT });
assert.equal(mail.getMailTestFallback(), null);

// Flag on: the built-in QA inbox is allowed as a retry target.
setEnv({ flag: 'true', overrideAddress: SUPPORT });
assert.equal(mail.getMailTestFallback(), SUPPORT);

// An explicit fallback is honoured regardless of the gate, and can be turned off.
setEnv({ fallback: 'qa.inbox@example.com' });
assert.equal(mail.getMailTestFallback(), 'qa.inbox@example.com');
setEnv({ flag: 'true', fallback: 'off' });
assert.equal(mail.getMailTestFallback(), null);

// --- flag ON -> real recipient AND support inbox in one send ----------------
// Capture what the transport was asked to deliver, without a live provider.
const captured = [];
const originalFetch = globalThis.fetch;
process.env.ZEPTOMAIL_API_KEY = 'test-key';
process.env.ZEPTOMAIL_FROM_EMAIL = 'no-reply@example.com';
globalThis.fetch = async (_url, init) => {
  captured.push(JSON.parse(init.body));
  return {
    ok: true,
    status: 201,
    json: async () => ({ request_id: 'test-request-id' }),
  };
};

function sentAddresses() {
  return captured.at(-1).to.map((r) => r.email_address.address);
}

try {
  setEnv({ flag: 'true', overrideAddress: SUPPORT });
  const dual = await mail.sendMail({ to: REAL_USER, subject: 'Hi', html: '<p>Body</p>' });
  assert.equal(captured.length, 1, 'override must not send two separate emails');
  assert.deepEqual(sentAddresses(), [REAL_USER, SUPPORT], 'both recipients must receive the mail');
  assert.equal(dual.usedOverride, true);
  assert.equal(dual.sentTo, REAL_USER);
  assert.equal(dual.copiedTo, SUPPORT);
  assert.match(captured.at(-1).htmlbody, /QA mail copy/, 'banner should say copy, not redirect');
  assert.ok(
    !/Delivered to/.test(captured.at(-1).htmlbody),
    'banner must not claim the real recipient was replaced',
  );
  assert.equal(captured.at(-1).subject, 'Hi', 'subject stays clean for the real recipient');

  // Multi-recipient callers (e.g. offers notify candidate + employer) keep everyone.
  setEnv({ flag: 'true', overrideAddress: SUPPORT });
  await mail.sendMail({ to: `${REAL_USER}, employer@example.com`, subject: 'Offer', html: '<p>x</p>' });
  assert.deepEqual(sentAddresses(), [REAL_USER, 'employer@example.com', SUPPORT]);

  // Support address is not duplicated when it is already the real recipient.
  setEnv({ flag: 'true', overrideAddress: SUPPORT });
  const same = await mail.sendMail({ to: SUPPORT, subject: 'Hi', html: '<p>x</p>' });
  assert.deepEqual(sentAddresses(), [SUPPORT]);
  assert.ok(!same.usedOverride, 'no copy needed when the recipient is already support');

  // --- flag OFF -> real recipient only, no support copy ---------------------
  setEnv({ overrideAddress: SUPPORT });
  const solo = await mail.sendMail({ to: REAL_USER, subject: 'Hi', html: '<p>x</p>' });
  assert.deepEqual(sentAddresses(), [REAL_USER], 'flag OFF must not copy support');
  assert.ok(!solo.usedOverride);
  assert.ok(!/QA mail/.test(captured.at(-1).htmlbody), 'no QA banner when override is off');
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.ZEPTOMAIL_API_KEY;
  delete process.env.ZEPTOMAIL_FROM_EMAIL;
}

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('OK: mail override gate — flag ON sends to the real user AND support, flag OFF to the real user only');
