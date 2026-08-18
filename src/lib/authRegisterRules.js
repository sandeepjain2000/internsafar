/** Auth registration helpers for Internship Portal. */

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isGmailAddress(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  return GMAIL_DOMAINS.has(e.slice(at + 1));
}

export function domainFromWebsite(website) {
  try {
    const u = new URL(String(website || '').startsWith('http') ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function domainFromEmail(email) {
  const parts = normalizeEmail(email).split('@');
  return (parts[1] || '').toLowerCase();
}

export function domainsMatch(website, email) {
  const web = domainFromWebsite(website);
  const mail = domainFromEmail(email);
  return Boolean(web && mail && web === mail);
}
