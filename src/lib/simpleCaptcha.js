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
  const body = Buffer.from(JSON.stringify({ a, b, exp })).toString('base64url');
  const sig = signBody(body);
  return {
    question: `What is ${a} + ${b}?`,
    token: `${body}${SEP}${sig}`,
  };
}

/**
 * One-time short gate after /api/auth/captcha/verify succeeds — safer through NextAuth form parsing.
 */
export function createCaptchaGate() {
  if (CAPTCHA_BYPASS_FOR_TESTING) return STATIC_CAPTCHA_TOKEN;
  const body = Buffer.from(JSON.stringify({ g: 1, exp: Date.now() + GATE_TTL_MS })).toString('base64url');
  const sig = signBody(body);
  return `${body}${SEP}${sig}`;
}

export function verifyCaptchaGate(gate) {
  if (CAPTCHA_BYPASS_FOR_TESTING) return true;
  const parts = splitToken(gate);
  if (!parts) return false;
  const expectedSig = signBody(parts.body);
  const sigBuf = Buffer.from(parts.sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts.body, 'base64url').toString('utf8'));
    if (!payload || payload.g !== 1) return false;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
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
  if (code === 'bad_token') {
    return 'Verification out of date. Click New Code, then enter the new answer.';
  }
  if (code === 'wrong_answer' || code === 'invalid') {
    return 'Incorrect answer. Try again or refresh the question.';
  }
  return 'Verification failed. Check your answer and try again.';
}
