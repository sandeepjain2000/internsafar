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

/**
 * Compact Asia/Kolkata stamp for export filenames: `YYYYMMDD_HHmm` (24-hour, no seconds).
 * Does not use the host timezone.
 */
export function formatIstExportStamp(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = get('hour');
  const minute = get('minute');
  if (hour === '24') hour = '00';
  if (!year || !month || !day || !hour || !minute) return '';
  return `${year}${month}${day}_${hour}${minute}`;
}
