import { formatIstExportStamp } from './ipIstTime.js';

const FALLBACK_PART = 'Unknown';

/** Keep ASCII letters/digits only, then truncate to 10. Empty → Unknown. */
export function sanitizeExportNamePart(value) {
  const cleaned = String(value || '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .slice(0, 10);
  return cleaned || FALLBACK_PART;
}

/**
 * `{Employer10}_{Posting10}_{YYYYMMDD}_{HHmm}.{extension}`
 * Timestamp must be the actual generation moment (pass `generatedAt` once per package).
 */
export function buildApplicantExportFilename({
  employerName,
  postingTitle,
  generatedAt = new Date(),
  extension,
} = {}) {
  const emp = sanitizeExportNamePart(employerName);
  const post = sanitizeExportNamePart(postingTitle);
  const stamp = formatIstExportStamp(generatedAt) || formatIstExportStamp(new Date());
  const ext = String(extension || 'xlsx').replace(/^\./, '');
  return `${emp}_${post}_${stamp}.${ext}`;
}
