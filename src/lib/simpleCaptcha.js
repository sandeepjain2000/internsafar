import crypto from 'crypto';
import { CAPTCHA_BYPASS_FOR_TESTING, STATIC_CAPTCHA_TOKEN } from '@/lib/captchaBypass';

const TTL_MS = 10 * 60 * 1000;
const GATE_TTL_MS = 2 * 60 * 1000;

export function isCaptchaBypassed() {
  return CAPTCHA_BYPASS_FOR_TESTING;
}

/** Fixed challenge when DUMMY_CAPTCHA is enabled (local/dev convenience). */
export const DUMMY_CAPTCHA_A = 3;
export const DUMMY_CAPTCHA_B = 4;
export const DUMMY_CAPTCHA_ANSWER = DUMMY_CAPTCHA_A + DUMMY_CAPTCHA_B;

/** Prefer ~ so qs/NextAuth allowDots never nests captchaToken=body.sig into an object. */
const SEP = '~';

function getSecret() {
  const s = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required for login captcha');
  }
  return s || 'ism-dev-captcha';
}

function signBody(body) {
  return crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
}

function splitToken(token) {
  const raw = String(token || '');
  if (!raw) return null;
  // New format: body~sig
  if (raw.includes(SEP)) {
    const i = raw.lastIndexOf(SEP);
    return { body: raw.slice(0, i), sig: raw.slice(i + 1) };
  }
  // Legacy format: body.sig (may break under qs allowDots — still accept if intact string)
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  return { body: parts[0], sig: parts[1] };
}

/**
 * Fixed 3+4 challenge only when DUMMY_CAPTCHA=true (QA convenience).
 * Default off so "New Code" rotates and answers must match the shown equation.
 */
export function isDummyCaptchaEnabled() {
  return process.env.DUMMY_CAPTCHA === 'true';
}

/**
 * @returns {{ question: string, token: string }}
 */
export function createLoginCaptcha() {
  // Always vary a/b so "New Code" changes the displayed challenge.
  // Bypass/dummy only affect whether verification is enforced — not UI freshness.
  const a = isDummyCaptchaEnabled() && !CAPTCHA_BYPASS_FOR_TESTING
    ? DUMMY_CAPTCHA_A
    : Math.floor(Math.random() * 9) + 1;
  const b = isDummyCaptchaEnabled() && !CAPTCHA_BYPASS_FOR_TESTING
    ? DUMMY_CAPTCHA_B
    : Math.floor(Math.random() * 9) + 1;
  if (CAPTCHA_BYPASS_FOR_TESTING) {
    return {
      question: `What is ${a} + ${b}?`,
      token: STATIC_CAPTCHA_TOKEN,
    };
  }
  const exp = Date.now() + TTL_MS;
  // n = one-time id; a submit that passes the captcha spends it (see consumeCaptcha).
  const n = crypto.randomBytes(12).toString('base64url');
  const body = Buffer.from(JSON.stringify({ a, b, exp, n })).toString('base64url');
  const sig = signBody(body);
  return {
    question: `What is ${a} + ${b}?`,
    token: `${body}${SEP}${sig}`,
  };
}

/** Signed payload of a captcha token or gate, or null when the signature does not match. */
function readSignedPayload(token) {
  if (token == null || typeof token === 'object') return null;
  const parts = splitToken(token);
  if (!parts) return null;
  const expectedSig = signBody(parts.body);
  const sigBuf = Buffer.from(parts.sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(parts.body, 'base64url').toString('utf8')) || null;
  } catch {
    return null;
  }
}

/** One-time id carried by a captcha token or gate (signature checked). */
export function captchaNonce(token) {
  const payload = readSignedPayload(token);
  return typeof payload?.n === 'string' && payload.n ? payload.n : null;
}

/**
 * Short gate after /api/auth/captcha/verify succeeds — safer through NextAuth form parsing.
 * Carries the captcha's one-time id, so spending the gate also spends the captcha.
 */
export function createCaptchaGate(nonce) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return STATIC_CAPTCHA_TOKEN;
  const body = Buffer.from(JSON.stringify({ g: 1, exp: Date.now() + GATE_TTL_MS, n: nonce })).toString('base64url');
  const sig = signBody(body);
  return `${body}${SEP}${sig}`;
}

export function verifyCaptchaGate(gate) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return true;
  const payload = readSignedPayload(gate);
  if (!payload || payload.g !== 1) return false;
  if (typeof payload.n !== 'string' || !payload.n) return false;
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;
  return true;
}

/**
 * Final check for a login / register / reset submit: accepts a gate or token+answer, then spends
 * the one-time id so the same solved captcha cannot be replayed.
 * @returns {Promise<null | 'missing_token' | 'missing_answer' | 'bad_token' | 'expired' | 'wrong_answer' | 'used'>}
 */
export async function consumeCaptcha(token, answer) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return null;
  if (!verifyCaptchaGate(token)) {
    const code = explainCaptchaFailure(token, answer);
    if (code) return code;
  }
  const nonce = captchaNonce(token);
  if (!nonce) return 'bad_token';
  const { consumeCaptchaNonce } = await import('@/lib/ipCaptchaNonce');
  return (await consumeCaptchaNonce(nonce)) ? null : 'used';
}

/**
 * Cryptographic check of signed challenge + numeric answer.
 * @param {string | undefined} token
 * @param {string | number | undefined} answer
 * @returns {boolean}
 */
export function verifyLoginCaptcha(token, answer) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return true;
  return explainCaptchaFailure(token, answer) === null;
}

/**
 * Distinguishes empty / missing / expired / bad signature / wrong math.
 * @returns {null | 'missing_token' | 'missing_answer' | 'bad_token' | 'expired' | 'wrong_answer'}
 */
export function explainCaptchaFailure(token, answer) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return null;
  // NextAuth/qs may nest dotted tokens into objects — treat as invalid (client should use ~ format).
  if (token != null && typeof token === 'object') return 'bad_token';
  if (!token) return 'missing_token';
  if (answer === undefined || answer === null || String(answer).trim() === '') {
    return 'missing_answer';
  }
  const parts = splitToken(token);
  if (!parts) return 'bad_token';
  const expectedSig = signBody(parts.body);
  const sigBuf = Buffer.from(parts.sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return 'bad_token';
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return 'bad_token';

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts.body, 'base64url').toString('utf8'));
  } catch {
    return 'bad_token';
  }
  if (!payload || typeof payload.a !== 'number' || typeof payload.b !== 'number') return 'bad_token';
  if (typeof payload.n !== 'string' || !payload.n) return 'bad_token';
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return 'expired';

  const n = Number(String(answer).trim());
  if (!Number.isFinite(n)) return 'wrong_answer';
  if (n !== payload.a + payload.b) return 'wrong_answer';
  return null;
}

export function captchaFailureMessage(code) {
  if (code === 'missing_answer') return 'Verification answer is required';
  if (code === 'missing_token') return 'Verification question is required — wait for it to load or refresh';
  if (code === 'expired') return 'Verification expired. Click New Code and try again.';
  if (code === 'used') return 'That verification was already used. Click New Code and answer the new question.';  if (code === 'bad_token') {
    return 'Verification out of date. Click New Code, then enter the new answer.';
  }
  if (code === 'wrong_answer' || code === 'invalid') {
    return 'Incorrect answer. Try again or refresh the question.';
  }
  return 'Verification failed. Check your answer and try again.';
}
