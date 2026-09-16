/**
 * Calendar-month duration between ISO date strings (YYYY-MM-DD).
 * Sep 16 → Nov 16 = 2. Returns null if either date missing/invalid or end < start.
 */
export function internshipDurationMonths(startISO, endISO) {
  const start = String(startISO || '').trim();
  const end = String(endISO || '').trim();
  if (!start || !end) return null;
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(+s) || Number.isNaN(+e) || e < s) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return Math.max(0, months);
}
