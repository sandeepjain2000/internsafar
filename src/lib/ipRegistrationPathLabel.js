/**
 * Human label for employer self-serve registration path.
 * Live UI uses Domain vs Free-email; DB may store domain | free_email | form (legacy free).
 */
export function registrationPathLabel(source) {
  const s = String(source || '').toLowerCase();
  if (s === 'domain') return 'Domain';
  if (s === 'free_email' || s === 'free-email' || s === 'form') return 'Free Email';
  if (s === 'google') return 'Google';
  if (s === 'gmail_domain') return 'Gmail Domain';
  if (s === 'legacy') return 'Legacy';
  return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown';
}
