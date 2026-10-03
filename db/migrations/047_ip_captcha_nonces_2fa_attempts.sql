-- 047: single-use captcha ids + wrong-code counter on 2FA challenges.
-- The app also creates both at runtime (ipCaptchaNonce.js, ensureIpTwoFactorSchema).
-- Additive only; existing challenges start at 0 failed attempts.

CREATE TABLE IF NOT EXISTS ip_captcha_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE ip_2fa_challenges ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
