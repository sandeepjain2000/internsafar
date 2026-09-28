/** Graduation-year range for candidate education rows (profile page + academics API). */
export const ACADEMIC_YEAR_MIN = 1950;
const ACADEMIC_YEAR_AHEAD = 8;

export function academicYearMax(now = new Date()) {
  return now.getFullYear() + ACADEMIC_YEAR_AHEAD;
}

/** Message for a filled-in graduation year outside the allowed range; '' when blank or valid. */
export function academicYearError(value, now = new Date()) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw);
  const max = academicYearMax(now);
  if (!Number.isInteger(n) || n < ACADEMIC_YEAR_MIN || n > max) {
    return `Enter a graduation year between ${ACADEMIC_YEAR_MIN} and ${max}.`;
  }
  return '';
}
