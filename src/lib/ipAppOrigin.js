/**
 * Resolve the public app origin for links in emails and share URLs.
 * Prefer NEXTAUTH_URL; fall back to request origin in dev only.
 */
export function resolveAppOrigin(requestUrl) {
  const fromEnv = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_URL (or NEXT_PUBLIC_APP_URL) is required in production');
  }
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      /* ignore malformed URL */
    }
  }
  return 'http://localhost:3000';
}

export function warnIfProductionAuthMisconfigured() {
  if (process.env.NODE_ENV !== 'production') return;
  const url = (process.env.NEXTAUTH_URL || '').trim();
  if (!url || /localhost/i.test(url)) {
    console.error(
      '[ip auth] NEXTAUTH_URL must be set to your production domain (e.g. https://internsafar.com). ' +
        'Auth redirects (sign-in, sign-out, Google OAuth) will fail until this is fixed and the app is rebuilt.',
    );
  }
}
