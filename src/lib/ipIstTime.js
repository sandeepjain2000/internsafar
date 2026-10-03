export const IST_TIME_ZONE = 'Asia/Kolkata';

/** "3 Oct 2026, 4:30 pm IST" — server-rendered text must not depend on the host time zone (UTC on Vercel). */
export function formatIstDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const text = d.toLocaleString('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${text} IST`;
}
