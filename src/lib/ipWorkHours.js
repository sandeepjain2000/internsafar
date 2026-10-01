/**
 * Posting working hours are stored as 24-hour "HH:MM" text (work_hours_start / work_hours_end)
 * and shown as 12-hour "h:MM AM/PM".
 */

export function parseWorkTime(value) {
  const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'a' && h === 12) h = 0;
    if (ap === 'p' && h !== 12) h += 12;
  } else if (h > 23) {
    return null;
  }
  return { h, m: min };
}

export function to12hParts(value) {
  const t = parseWorkTime(value);
  if (!t) return null;
  return {
    hour: String(t.h % 12 === 0 ? 12 : t.h % 12),
    minute: String(t.m).padStart(2, '0'),
    period: t.h < 12 ? 'AM' : 'PM',
  };
}

export function from12hParts({ hour, minute, period }) {
  if (!hour) return '';
  let h = Number(hour) % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${String(minute || '00').padStart(2, '0')}`;
}

export function formatWorkTime12h(value) {
  const p = to12hParts(value);
  return p ? `${p.hour}:${p.minute} ${p.period}` : String(value ?? '').trim();
}

export function formatWorkHoursRange(start, end) {
  if (!start || !end) return '';
  return `${formatWorkTime12h(start)} – ${formatWorkTime12h(end)}`;
}
