/**
 * Share text for an employer posting, same on every channel:
 *   intro (2 lines)
 *
 *   link
 *
 *   employer description (whole sentences / whole lines only)
 * LinkedIn posts cap at 3000 characters; the same cap keeps wa.me links a safe length.
 */
export const POSTING_SHARE_MAX_CHARS = 2900;

const BULLET_RE = /^\s*(?:[-*•●▪–]|\d+[.)])\s+/;

export function postingShareIntro(title) {
  const t = String(title || '').trim();
  return `Looking for your next opportunity? ${t} is now listed on InternSafar.\nSee the role details and apply here 👇`;
}

function normalizeDescription(description) {
  return String(description || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Points where the text can end without splitting a sentence or a line. A full stop followed by a
// digit or lowercase word ("Rs. 10,000", "e.g. retail") is not a sentence end.
function cutPoints(text) {
  const points = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      points.push(i);
    } else if (ch === '.' || ch === '!' || ch === '?') {
      const rest = text.slice(i + 1);
      if (!rest || /^\s+(?=[A-Z"'“(•●▪*\-–]|$)/.test(rest) || /^\s*\n/.test(rest)) points.push(i + 1);
    }
  }
  return points;
}

/** Longest leading part of the description that fits `maxChars` and ends on a whole sentence/line. */
export function fitPostingDescription(description, maxChars) {
  const text = normalizeDescription(description);
  if (!text || maxChars <= 0) return '';
  if (text.length <= maxChars) return text;

  const cut = cutPoints(text).filter((p) => p <= maxChars).pop();
  if (!cut) return '';
  const lines = text.slice(0, cut).trimEnd().split('\n');
  const rest = text.slice(cut).trimStart();
  // Do not end on a section heading ("Responsibilities:" or a title line above a cut-off list).
  const last = (lines[lines.length - 1] || '').trim();
  if (BULLET_RE.test(rest) && !BULLET_RE.test(last) && !/[.!?]$/.test(last)) lines.pop();
  while (lines.length && /^\s*$|:\s*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join('\n').trim();
}

export function postingShareText({ title, link, description }) {
  const head = `${postingShareIntro(title)}\n\n${link}`;
  const desc = fitPostingDescription(description, POSTING_SHARE_MAX_CHARS - head.length - 2);
  return desc ? `${head}\n\n${desc}` : head;
}
