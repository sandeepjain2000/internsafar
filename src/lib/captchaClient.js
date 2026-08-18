import { CAPTCHA_BYPASS_FOR_TESTING, STATIC_CAPTCHA_TOKEN } from '@/lib/captchaBypass';

/** Read token + typed answer from LoginCaptchaField (avoids stale React state / autofill). */
export function readCaptchaField(fieldRef, fallbackToken = '', fallbackAnswer = '') {
  const fromField = fieldRef?.current?.getChallenge?.();
  if (fromField?.token) return fromField;
  return {
    token: String(fallbackToken || ''),
    answer: String(fallbackAnswer ?? '')
      .replace(/[^\d-]/g, '')
      .trim(),
  };
}

/**
 * Client-side helper to verify captcha before login/register continues.
 * @returns {Promise<{ ok: boolean, error?: string, code?: string, gate?: string }>}
 */
export async function verifyCaptchaAnswer(captchaToken, captchaAnswer) {
  if (CAPTCHA_BYPASS_FOR_TESTING) {
    return { ok: true, gate: STATIC_CAPTCHA_TOKEN };
  }
  if (!String(captchaAnswer ?? '').trim()) {
    return { ok: false, error: 'Verification answer is required', code: 'missing_answer' };
  }
  if (!captchaToken) {
    return {
      ok: false,
      error: 'Verification question is required — wait for it to load or refresh',
      code: 'missing_token',
    };
  }
  try {
    const res = await fetch('/api/auth/captcha/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ captchaToken, captchaAnswer }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return { ok: true, gate: data.gate || null };
    }
    return {
      ok: false,
      error: data.error || 'Verification failed. Check your answer and try again.',
      code: data.code || 'invalid',
    };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}
