/**
 * Read helpers for ip_candidates.prior_experience.
 *
 * The candidate profile editor serialises work experience as a JSON array of
 * { title, organization, start, end, description } (see serializeExperienceEntries),
 * while older rows hold plain free text. Every employer-facing surface renders through
 * here so neither shape can ever reach a page as a raw JSON string.
 *
 * Start/end are free text as typed by the candidate ("Jun 2025", "Present") — they are
 * displayed verbatim and only parsed on a best-effort basis for the experience filter.
 */
import { parseExperienceEntries } from '@/lib/ipPostingBody';

const PRESENT = /^(present|current|now|ongoing)$/i;

/**
 * Filled entries only — [] when the candidate has not written anything.
 *
 * JSON-looking text is parsed here rather than through parseExperienceEntries' editor
 * fallback, which turns an unparseable or empty array into a single entry whose
 * description is the raw string — that fallback is right for the editor but would print
 * "[]" or a broken fragment to an employer.
 */
export function experienceEntries(raw) {
  const filled = (e) => e && (e.title || e.organization || e.description);
  if (Array.isArray(raw)) return parseExperienceEntries(raw).filter(filled);

  const text = String(raw || '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parseExperienceEntries(parsed).filter(filled);
  }
  return parseExperienceEntries(text).filter(filled);
}

/** True when the row is legacy free text rather than editor-structured entries. */
export function experienceIsFreeText(raw) {
  if (Array.isArray(raw)) return false;
  const text = String(raw || '').trim();
  if (!text) return false;
  return !text.startsWith('[');
}

/** "Jun 2025 – Present", or whichever side the candidate filled in. */
export function experienceRangeLabel(entry) {
  const start = String(entry?.start || '').trim();
  const end = String(entry?.end || '').trim();
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

/** "Frontend intern · Nova Labs" — the one-line form for a table cell. */
export function experienceEntryLabel(entry) {
  const parts = [entry?.title, entry?.organization].map((p) => String(p || '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return String(entry?.description || '').trim();
}

/**
 * Compact label for list/table cells, where only one line fits.
 * Falls back to the years estimate so a cell is never blank.
 */
export function experienceSummaryLabel(raw, { fallbackYears = 0 } = {}) {
  const entries = experienceEntries(raw);
  if (!entries.length) {
    return fallbackYears ? `${trimNumber(fallbackYears)} yr` : 'None listed';
  }
  if (experienceIsFreeText(raw)) return experienceEntryLabel(entries[0]) || 'Listed';
  const first = experienceEntryLabel(entries[0]) || 'Experience listed';
  return entries.length > 1 ? `${first} +${entries.length - 1} more` : first;
}

/**
 * Years of experience for the employer filter and sort.
 *
 * Structured entries are measured from their date text where it parses, otherwise each
 * entry counts as half a year — the same weight the legacy free-text rule gave an
 * internship or project. Legacy free text keeps its original keyword behaviour so
 * existing filter results do not shift.
 */
export function experienceYears(raw) {
  const entries = experienceEntries(raw);
  if (!entries.length) return 0;

  if (experienceIsFreeText(raw)) return freeTextYears(raw);

  let months = 0;
  let measured = 0;
  for (const entry of entries) {
    const span = monthsBetween(entry.start, entry.end);
    if (span != null) {
      months += span;
      measured += 1;
    }
  }
  const unmeasured = entries.length - measured;
  const years = months / 12 + unmeasured * 0.5;
  return Math.round(years * 10) / 10;
}

function freeTextYears(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return 0;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(year|yr)/);
  if (m) return Number(m[1]);
  if (/intern|project|month/.test(s)) return 0.5;
  return 1;
}

/** Whole months between two free-text dates, or null when either side is unparseable. */
function monthsBetween(start, end) {
  const from = parseLooseDate(start);
  if (!from) return null;
  const to = PRESENT.test(String(end || '').trim()) ? new Date() : parseLooseDate(end);
  if (!to) return null;
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return months > 0 ? months : 0;
}

function parseLooseDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const ts = Date.parse(/^\d{4}-\d{2}$/.test(text) ? `${text}-01` : `1 ${text}`);
  if (!Number.isNaN(ts)) return new Date(ts);
  const direct = Date.parse(text);
  return Number.isNaN(direct) ? null : new Date(direct);
}

function trimNumber(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** Single readable line for CSV export / plain-text contexts. */
export function experienceExportText(raw) {
  const entries = experienceEntries(raw);
  if (!entries.length) return '';
  if (experienceIsFreeText(raw)) return String(raw).trim();
  return entries
    .map((e) => {
      const range = experienceRangeLabel(e);
      const head = [experienceEntryLabel(e), range].filter(Boolean).join(' (') + (range ? ')' : '');
      const desc = String(e.description || '').replace(/\s*\n\s*/g, '; ').trim();
      return desc ? `${head}: ${desc}` : head;
    })
    .join(' | ');
}
