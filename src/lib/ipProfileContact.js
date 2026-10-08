/**
 * Candidate profile links and messaging handles: LinkedIn, GitHub / Portfolio, Portfolio,
 * Personal website, WhatsApp number, Telegram handle.
 * Shared by the profile form (inline message) and PUT /api/ip/candidate/profile.
 *
 * Only a value the candidate changed must pass — a stored legacy value never blocks Save
 * of unrelated fields (the form posts every field on each save).
 */

import { validateOptionalPhone } from '@/lib/ipPhoneValidation';

export const MAX_LINK_LENGTH = 255;

export const CONTACT_FIELDS = [
  ['linkedin_url', 'LinkedIn Profile URL'],
  ['github_url', 'GitHub / Portfolio URL'],
  ['portfolio_url', 'Portfolio URL'],
  ['personal_website', 'Personal website'],
  ['whatsapp_number', 'WhatsApp number'],
  ['telegram_handle', 'Telegram handle'],
];

const WEB_LINK_FIELDS = new Set(['linkedin_url', 'github_url', 'portfolio_url', 'personal_website']);
const LINKEDIN_PROFILE_PATH = /^\/(?:in|pub|m\/in|mwlite\/in)\/[^/?#\s]+/i;
const TELEGRAM_HANDLE = /^@?([A-Za-z][A-Za-z0-9_]{4,31})$/;

/** Parsed http(s) URL (bare domains get https://), or null when it is not a usable web link. */
function parseWebLink(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /\s/.test(raw)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (hasScheme && !/^https?:\/\//i.test(raw)) return null;
  let url;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(url.hostname)) return null;
  return url;
}

/** Error text for one field, or null when it is blank or valid. `dial` is the mobile country code. */
export function contactFieldError(field, value, dial) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const label = CONTACT_FIELDS.find(([f]) => f === field)?.[1] || field;

  if (WEB_LINK_FIELDS.has(field)) {
    if (raw.length > MAX_LINK_LENGTH) return `${label} is too long (${MAX_LINK_LENGTH} characters max).`;
    const url = parseWebLink(raw);
    if (field === 'linkedin_url') {
      const ok = url && /(^|\.)linkedin\.com$/i.test(url.hostname) && LINKEDIN_PROFILE_PATH.test(url.pathname);
      return ok ? null : 'Enter your LinkedIn profile link, like https://www.linkedin.com/in/your-name.';
    }
    return url ? null : `${label} must be a web link, like https://yourname.com.`;
  }
  if (field === 'whatsapp_number') {
    const dialCode = String(dial || '').trim() || '+91';
    return validateOptionalPhone(raw, dialCode).ok
      ? null
      : `WhatsApp number isn't valid for ${dialCode}. Use the same country code as your mobile, or start with + and the country code.`;
  }
  if (field === 'telegram_handle') {
    return TELEGRAM_HANDLE.test(raw)
      ? null
      : 'Telegram handle must be 5–32 letters, numbers or underscores, starting with a letter (like @your_name).';
  }
  return null;
}

/** Stored form of a valid value: web links get https://, Telegram handles get a leading @. */
export function normalizeContactField(field, value) {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;
  if (WEB_LINK_FIELDS.has(field)) {
    return parseWebLink(raw) && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
  }
  if (field === 'telegram_handle') return TELEGRAM_HANDLE.test(raw) ? `@${raw.replace(/^@/, '')}` : raw;
  return raw;
}

/**
 * First invalid changed value in a profile payload: { field, error }, or null.
 * Skips fields not sent and fields equal to the stored value in `prev`.
 */
export function firstContactFieldError(body, prev, dial) {
  for (const [field] of CONTACT_FIELDS) {
    if (body?.[field] === undefined) continue;
    const next = String(body[field] ?? '').trim();
    if (next === String(prev?.[field] ?? '').trim()) continue;
    const error = contactFieldError(field, next, dial);
    if (error) return { field, error };
  }
  return null;
}

/** Copy of `body` with every sent contact field trimmed and normalized. */
export function normalizeContactFields(body) {
  const out = { ...body };
  for (const [field] of CONTACT_FIELDS) {
    if (out[field] === undefined || out[field] === null) continue;
    out[field] = normalizeContactField(field, out[field]);
  }
  return out;
}
