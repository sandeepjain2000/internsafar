/**
 * Presentation Title Case for system status / badge labels.
 * Does not change stored DB enums — display only.
 */
export function toTitleCaseLabel(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => {
      if (!word) return '';
      if (/^[A-Z0-9]{2,}$/.test(word) && word.length <= 4) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
