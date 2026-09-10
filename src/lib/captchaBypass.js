/**
 * Captcha enforcement switch.
 * false = real numbered challenge (signed token; wrong answer blocks login/register).
 * true = UI still shows a challenge but verification always passes (testing only).
 */
export const CAPTCHA_BYPASS_FOR_TESTING = false;

export const STATIC_CAPTCHA_A = 3;
export const STATIC_CAPTCHA_B = 4;
export const STATIC_CAPTCHA_QUESTION = `What is ${STATIC_CAPTCHA_A} + ${STATIC_CAPTCHA_B}?`;
export const STATIC_CAPTCHA_BADGE = `${STATIC_CAPTCHA_A} + ${STATIC_CAPTCHA_B} = ?`;
export const STATIC_CAPTCHA_TOKEN = 'testing-bypass';
