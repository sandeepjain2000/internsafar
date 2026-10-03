import crypto from 'crypto';

/** Reset links carry the raw token; ip_password_resets.token stores sha256 hex (64 chars). */
export function hashPasswordResetToken(raw) {
  return crypto.createHash('sha256').update(String(raw || '')).digest('hex');
}

export function newPasswordResetToken() {
  const raw = crypto.randomBytes(24).toString('base64url');
  return { raw, hash: hashPasswordResetToken(raw) };
}
