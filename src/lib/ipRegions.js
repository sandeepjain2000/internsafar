/** Shared country/region values. Profile/registration label = Country; list filters = Region. */
export const IP_REGION_OPTIONS = ['India', 'Bangladesh', 'Sri Lanka', 'Indonesia'];

export const IP_REGION_SELECT_OPTIONS = IP_REGION_OPTIONS.map((value) => ({
  value,
  label: value,
}));

export function normalizeRegionList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function matchesRegionValue(storedCountry, regionFilter) {
  const wants = normalizeRegionList(regionFilter).map((s) => s.toLowerCase());
  if (!wants.length) return true;
  const country = String(storedCountry || 'India').trim().toLowerCase() || 'india';
  return wants.some((w) => country === w);
}
