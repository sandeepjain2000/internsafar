import { randomBytes } from 'crypto';

export const UNSUBSCRIBE_STATUS = {
  PENDING: 'PENDING',
  PROCESSED: 'PROCESSED',
};

export const UNSUBSCRIBE_LINK_TEXT = 'unsubscribe';

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function normalizeUnsubscribeEmail(email) {
  const value = String(email || '')
    .trim()
    .toLowerCase();
  if (!value.includes('@')) return '';
  return value;
}

export function createUnsubscribeToken() {
  return randomBytes(32).toString('base64url');
}

export function isValidUnsubscribeToken(token) {
  const value = String(token || '').trim();
  return TOKEN_RE.test(value) && !value.includes('@');
}

export function buildUnsubscribeUrl(origin, token) {
  const base = String(origin || '')
    .trim()
    .replace(/\/$/, '');
  return `${base || 'http://localhost:3000'}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function unsubscribeHtmlFooter(url) {
  const href = String(url || '');
  return `<p style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">
  If you no longer want these emails, <a href="${href}" style="color:#64748b;text-decoration:underline">${UNSUBSCRIBE_LINK_TEXT}</a>.
</p>`;
}

export function appendUnsubscribeHtml(html, url) {
  const footer = unsubscribeHtmlFooter(url);
  const source = String(html || '');
  if (!source.trim()) return footer;
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${source}${footer}`;
}

export function appendUnsubscribeText(text, url) {
  // Plain-text clients need the URL; keep the word "unsubscribe" as the label, not a bare link dump.
  const line = `\n\nIf you no longer want these emails, ${UNSUBSCRIBE_LINK_TEXT}: ${url}\n`;
  const source = String(text || '');
  return `${source}${line}`;
}

export function applyUnsubscribeFooter(opts, url) {
  const htmlSource =
    opts.html
    || (opts.text ? String(opts.text).replace(/\n/g, '<br/>') : '');
  return {
    ...opts,
    html: appendUnsubscribeHtml(htmlSource, url),
    text: appendUnsubscribeText(opts.text || '', url),
  };
}

/** Decide whether a click should insert a new PENDING row. */
export function decideUnsubscribeRecord({ tokenRow, existingPending }) {
  if (!tokenRow) return { action: 'reject', reason: 'invalid_token' };
  if (existingPending) {
    return { action: 'reuse', request: existingPending };
  }
  return { action: 'create' };
}
