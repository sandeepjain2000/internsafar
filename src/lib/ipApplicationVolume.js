/**
 * Candidate-facing application volume ranges (always include '+').
 * Derived from total historical applications including rejected.
 */

const BUCKETS = [
  { min: 2000, label: '2,000+' },
  { min: 1000, label: '1,000+' },
  { min: 500, label: '500+' },
  { min: 200, label: '200+' },
  { min: 100, label: '100+' },
  { min: 50, label: '50+' },
];

export function applicationVolumeRange(historicalCount) {
  const n = Math.max(0, Number(historicalCount) || 0);
  for (const b of BUCKETS) {
    if (n >= b.min) return b.label;
  }
  if (n <= 0) return null;
  // Below 50: still show a + range without exposing exact (use 1+ for any activity)
  if (n >= 1) return `${n < 50 ? (n >= 25 ? '25+' : n >= 10 ? '10+' : '1+') : '50+'}`;
  return null;
}

/** Spec buckets only when >= 50; otherwise null (hide) or soft floor — prefer hide under 50 for honesty. */
export function publicApplicationVolumeLabel(historicalCount) {
  const n = Math.max(0, Number(historicalCount) || 0);
  for (const b of BUCKETS) {
    if (n >= b.min) return b.label;
  }
  return null;
}

export const ACTIVE_APPLICATION_STATUSES_SQL = `
  status NOT IN ('rejected', 'withdrawn')
`;

export function isActiveApplicationStatus(status) {
  const s = String(status || '').toLowerCase();
  return s !== 'rejected' && s !== 'withdrawn';
}
