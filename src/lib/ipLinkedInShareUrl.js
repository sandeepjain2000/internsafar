/**
 * Validate employer-submitted LinkedIn post URLs for posting-share rewards.
 * Accepts linkedin.com (and www / country subdomains) http(s) URLs.
 */
export function isLinkedInPostUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return false;
  let url;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return (
    host === 'linkedin.com' ||
    host === 'www.linkedin.com' ||
    host.endsWith('.linkedin.com')
  );
}
