/**
 * Temporary testing switch: captcha stays on screen but never blocks.
 * AWS/hosting of the numbered challenge was failing; re-enable by setting this to false.
 */
export const CAPTCHA_BYPASS_FOR_TESTING = true;

export const STATIC_CAPTCHA_A = 3;
export const STATIC_CAPTCHA_B = 4;
export const STATIC_CAPTCHA_QUESTION = `What is ${STATIC_CAPTCHA_A} + ${STATIC_CAPTCHA_B}?`;
export const STATIC_CAPTCHA_BADGE = `${STATIC_CAPTCHA_A} + ${STATIC_CAPTCHA_B} = ?`;
export const STATIC_CAPTCHA_TOKEN = 'testing-bypass';
