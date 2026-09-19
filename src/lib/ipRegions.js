/** Shared country/region values.
 * Profile / registration label = Country (single).
 * List filters label = Region (multi-select).
 */
export const IP_COUNTRY_OPTIONS = [
  'India',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'Indonesia',
  'Malaysia',
  'Thailand',
];

/** @deprecated Prefer IP_COUNTRY_OPTIONS — same list used for Region filters. */
export const IP_REGION_OPTIONS = IP_COUNTRY_OPTIONS;

export const IP_COUNTRY_SELECT_OPTIONS = IP_COUNTRY_OPTIONS.map((value) => ({
  value,
  label: value,
}));

export const IP_REGION_SELECT_OPTIONS = IP_COUNTRY_SELECT_OPTIONS;

const COUNTRY_SET = new Set(IP_COUNTRY_OPTIONS.map((c) => c.toLowerCase()));

/** Normalize a stored/submitted country to a known option (default India). */
export function normalizeCountry(value) {
  const v = String(value || '').trim();
  if (!v) return 'India';
  const hit = IP_COUNTRY_OPTIONS.find((c) => c.toLowerCase() === v.toLowerCase());
  return hit || 'India';
}

export function isAllowedCountry(value) {
  return COUNTRY_SET.has(String(value || '').trim().toLowerCase());
}

export function normalizeRegionList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeCountry(s))
    .filter((s, i, arr) => arr.indexOf(s) === i);
}

export function matchesRegionValue(storedCountry, regionFilter) {
  const wants = normalizeRegionList(regionFilter).map((s) => s.toLowerCase());
  if (!wants.length) return true;
  const country = normalizeCountry(storedCountry).toLowerCase();
  return wants.some((w) => country === w);
}
