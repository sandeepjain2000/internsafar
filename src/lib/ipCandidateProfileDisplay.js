/** Read-only formatting of ip_candidates fields shared by the employer view and Excel exports. */

/** Labels for ongoing_commitment_choice. */
const COMMITMENT_DISPLAY = {
  none: 'No other commitments',
  other_internship: 'Another internship',
  offline_classes: 'Offline / college classes',
  part_time_work: 'Part-time job or other work',
  other: 'Other',
};

/** Choice label plus the candidate's note; falls back to the legacy boolean column. */
export function commitmentLabel(row) {
  const choice = String(row?.ongoing_commitment_choice || '');
  let label = COMMITMENT_DISPLAY[choice] || '';
  if (!label && row?.ongoing_commitment === true) label = 'Yes';
  if (!label && row?.ongoing_commitment === false) label = 'No';
  const note = String(row?.ongoing_commitment_note || '').trim();
  if (note) return label ? `${label}: ${note}` : note;
  return label;
}

/** DATE column → 'YYYY-MM-DD' without shifting the day across timezones. */
export function dayString(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${m}-${d}`;
  }
  const s = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Extra CV links stored as JSONB [{ url, title }]. */
export function resumeLinkList(value) {
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => ({ url: String(item?.url || '').trim(), title: String(item?.title || '').trim() }))
    .filter((item) => item.url);
}

export function textList(value) {
  if (Array.isArray(value)) return value.map((s) => String(s ?? '').trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}
