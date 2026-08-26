/**
 * Optional rich text for message / offer composers.
 * Markers are plain <b>/<i>/<u>; render only after sanitizing to those tags.
 */

const ALLOWED_TAG_RE = /<\/?(?:b|i|u)>/gi;

/** Escape HTML, then re-enable only <b>/<i>/<u> (any case). */
export function sanitizeMessageHtml(raw) {
  const text = String(raw ?? '');
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/&lt;(\/?)(b|i|u)&gt;/gi, '<$1$2>');
}

/** True when body contains allowed formatting tags (after sanitize still has tags). */
export function hasRichMarkup(raw) {
  return ALLOWED_TAG_RE.test(String(raw ?? ''));
}

/** Strip tags for empty checks / search previews. */
export function plainTextFromMessageHtml(raw) {
  return String(raw ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u200b/g, '')
    .trim();
}

/**
 * Normalize contentEditable HTML (strong/em/b/i/u/br/div) down to allowed <b>/<i>/<u>.
 */
export function normalizeEditorHtml(raw) {
  let html = String(raw ?? '');
  if (!html || html === '<br>' || html === '<div><br></div>') return '';
  html = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/<\/?(strong|b)(\s[^>]*)?>/gi, (m) => (/^<\//.test(m) ? '</b>' : '<b>'))
    .replace(/<\/?(em|i)(\s[^>]*)?>/gi, (m) => (/^<\//.test(m) ? '</i>' : '<i>'))
    .replace(/<\/?u(\s[^>]*)?>/gi, (m) => (/^<\//.test(m) ? '</u>' : '<u>'))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>\s*<div>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<\/?(div|p|span)(\s[^>]*)?>/gi, '');
  html = html.replace(/<(?!\/?(?:b|i|u)\b)[^>]+>/gi, '');
  const unescaped = html
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return sanitizeMessageHtml(unescaped);
}

/**
 * Wrap the current selection (or insert empty tags at caret) with <tag>…</tag>.
 * @returns {{ value: string, selectionStart: number, selectionEnd: number }}
 */
export function wrapSelection(value, start, end, tag) {
  const v = String(value ?? '');
  const t = String(tag || 'b').toLowerCase();
  if (!['b', 'i', 'u'].includes(t)) {
    return { value: v, selectionStart: start, selectionEnd: end };
  }
  const open = `<${t}>`;
  const close = `</${t}>`;
  const s = Math.max(0, Math.min(start ?? 0, v.length));
  const e = Math.max(s, Math.min(end ?? s, v.length));
  if (s === e) {
    const next = `${v.slice(0, s)}${open}${close}${v.slice(e)}`;
    const caret = s + open.length;
    return { value: next, selectionStart: caret, selectionEnd: caret };
  }
  const next = `${v.slice(0, s)}${open}${v.slice(s, e)}${close}${v.slice(e)}`;
  return {
    value: next,
    selectionStart: s,
    selectionEnd: e + open.length + close.length,
  };
}
