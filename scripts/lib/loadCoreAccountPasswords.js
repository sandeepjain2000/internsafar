/**
 * Load core-account passwords from a local JSON file (never commit).
 *
 * Search order:
 *   1. IP_CORE_PASSWORDS_FILE
 *   2. <app>/coreaccountspass.json
 *   3. <app>/.local/coreaccountspass.json
 *   4. <workspace>/coreaccountspass.json (parent of internship-portal)
 *
 * Expected shape:
 *   { "accounts": [ { "role", "email", "newPassword" }, ... ] }
 *
 * Never logs password values.
 */
const fs = require('fs');
const path = require('path');

const APP_ROOT = path.resolve(__dirname, '..', '..');

let cached = null;

function candidatePaths() {
  const out = [];
  if (process.env.IP_CORE_PASSWORDS_FILE) {
    out.push(path.resolve(process.env.IP_CORE_PASSWORDS_FILE));
  }
  out.push(path.join(APP_ROOT, 'coreaccountspass.json'));
  out.push(path.join(APP_ROOT, '.local', 'coreaccountspass.json'));
  out.push(path.join(APP_ROOT, '..', 'coreaccountspass.json'));
  return out;
}

function loadCoreAccountPasswords(options = {}) {
  const force = options.force === true;
  if (cached && !force) return cached;

  const tried = [];
  let filePath = null;
  let raw = null;
  for (const p of candidatePaths()) {
    tried.push(p);
    if (fs.existsSync(p)) {
      filePath = p;
      raw = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (!filePath) {
    const err = new Error(
      'coreaccountspass.json not found. Create it (gitignored) with the three core account passwords.\n'
        + `Tried:\n${tried.map((p) => `  - ${p}`).join('\n')}\n`
        + 'Or set IP_CORE_PASSWORDS_FILE to an absolute path.',
    );
    err.code = 'CORE_PASSWORDS_MISSING';
    throw err;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${filePath}: ${e.message}`);
  }

  const accounts = Array.isArray(json.accounts) ? json.accounts : [];
  if (!accounts.length) {
    throw new Error(`${filePath} has no accounts[]`);
  }

  const byEmail = new Map();
  const byRole = new Map();
  for (const a of accounts) {
    const email = String(a.email || '').trim().toLowerCase();
    const role = String(a.role || '').trim().toLowerCase();
    const password = String(a.newPassword ?? a.password ?? '');
    if (!email || !email.includes('@')) {
      throw new Error(`Invalid email in ${filePath}`);
    }
    if (!password || /^REPLACE_ME_/i.test(password) || password.length < 8) {
      throw new Error(
        `Missing/placeholder password for ${email} in ${filePath} (len=${password.length})`,
      );
    }
    byEmail.set(email, password);
    if (role) byRole.set(role, password);
  }

  cached = {
    filePath,
    byEmail,
    byRole,
    emails: [...byEmail.keys()],
  };
  return cached;
}

function getCorePasswordForEmail(email) {
  const { byEmail } = loadCoreAccountPasswords();
  const key = String(email || '').trim().toLowerCase();
  const pw = byEmail.get(key);
  if (!pw) {
    throw new Error(`No password in coreaccountspass.json for email ${key}`);
  }
  return pw;
}

function getCorePasswordForRole(role) {
  const { byRole } = loadCoreAccountPasswords();
  const key = String(role || '').trim().toLowerCase();
  const pw = byRole.get(key);
  if (!pw) {
    throw new Error(`No password in coreaccountspass.json for role ${key}`);
  }
  return pw;
}

/** Password for cast/filler accounts that share a role but are not listed in JSON. */
function getCorePasswordForEmailOrRole(email, role) {
  const { byEmail, byRole } = loadCoreAccountPasswords();
  const key = String(email || '').trim().toLowerCase();
  if (byEmail.has(key)) return byEmail.get(key);
  const r = String(role || '').trim().toLowerCase();
  if (r && byRole.has(r)) return byRole.get(r);
  throw new Error(`No password for ${key || '(no email)'} / role=${r || '?'}`);
}

function corePasswordsFilePath() {
  return loadCoreAccountPasswords().filePath;
}

module.exports = {
  loadCoreAccountPasswords,
  getCorePasswordForEmail,
  getCorePasswordForRole,
  getCorePasswordForEmailOrRole,
  corePasswordsFilePath,
  candidatePaths,
};
