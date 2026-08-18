/** Free / consumer mail domains (blocked for employer work-email registration). */
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'rediffmail.com',
]);

export function emailDomain(email) {
  const parts = String(email || '')
    .trim()
    .toLowerCase()
    .split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
  return parts[1];
}

/** Hostname from a URL or bare domain, without leading www. */
export function websiteRegistrableHost(website) {
  const raw = String(website || '').trim().toLowerCase();
  if (!raw) return '';
  let host = raw;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    host = new URL(withProto).hostname;
  } catch {
    host = raw.replace(/^https?:\/\//i, '').split('/')[0];
  }
  host = host.replace(/:\d+$/, '');
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

export function isFreeMailDomain(domain) {
  return FREE_MAIL_DOMAINS.has(String(domain || '').toLowerCase());
}

export function isFreeMailEmail(email) {
  return isFreeMailDomain(emailDomain(email));
}

/**
 * Work email domain must equal website host (or be a subdomain of it).
 * e.g. hr@acme.com ↔ https://www.acme.com ; careers@jobs.acme.com ↔ acme.com
 */
export function emailMatchesWebsite(email, website) {
  const mail = emailDomain(email);
  const host = websiteRegistrableHost(website);
  if (!mail || !host) return false;
  return mail === host || mail.endsWith(`.${host}`) || host.endsWith(`.${mail}`);
}

export function companyLabelFromWebsite(website) {
  const host = websiteRegistrableHost(website);
  if (!host) return 'Company';
  const base = host.split('.')[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
