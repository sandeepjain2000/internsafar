/** Client field validation helpers for ISM forms. */

export function required(value, label = 'This field') {
  const v = typeof value === 'string' ? value.trim() : value;
  if (v === null || v === undefined || v === '') return `${label} is required`;
  return null;
}

export function emailFormat(value) {
  const v = String(value || '').trim();
  if (!v) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  if (v.length > 120) return 'Email is too long';
  return null;
}

export function minLength(value, min, label = 'This field') {
  const v = String(value || '').trim();
  if (v.length < min) return `${label} must be at least ${min} characters`;
  return null;
}

export function maxLength(value, max, label = 'This field') {
  const v = String(value || '');
  if (v.length > max) return `${label} must be at most ${max} characters`;
  return null;
}

export function numberInRange(value, { min, max, label = 'Value', required: req = true } = {}) {
  if (value === '' || value === null || value === undefined) {
    return req ? `${label} is required` : null;
  }
  const n = Number(value);
  if (Number.isNaN(n)) return `${label} must be a number`;
  if (min != null && n < min) return `${label} must be at least ${min}`;
  if (max != null && n > max) return `${label} must be at most ${max}`;
  return null;
}

export function dateRequired(value, label = 'Date') {
  if (!value) return `${label} is required`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return `${label} is invalid`;
  return null;
}

export function passwordRequired(value) {
  if (!value) return 'Password is required';
  if (String(value).length < 6) return 'Password must be at least 6 characters';
  return null;
}

export function collectErrors(checks) {
  const errors = {};
  for (const [key, msg] of Object.entries(checks)) {
    if (msg) errors[key] = msg;
  }
  return errors;
}

export function hasErrors(errors) {
  return Object.keys(errors).length > 0;
}
