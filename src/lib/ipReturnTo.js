import { ROLE_HOME } from '@/lib/roleHome';

/**
 * Page to open after sign-in (e.g. a shared posting link). Kept in localStorage as well as
 * `?next=` because candidate registration goes through Google and a temp-password email,
 * and the Google return URL is fixed server-side.
 */
const KEY = 'ip_return_to';
const TTL_MS = 24 * 60 * 60 * 1000;

export const POSTING_PATH_PREFIX = '/candidate/internships/';

export function safeReturnPath(value) {
  const p = String(value || '').trim();
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\') || p.length > 500) return '';
  return p;
}

export function rememberReturnTo(value) {
  const path = safeReturnPath(value);
  if (!path) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function readReturnTo() {
  try {
    const { path, at } = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    if (!path || Date.now() - Number(at || 0) > TTL_MS) return '';
    return safeReturnPath(path);
  } catch {
    return '';
  }
}

export function clearReturnTo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The saved path only if it belongs to this role's portal; otherwise ''. */
export function returnPathForRole(value, role) {
  const path = safeReturnPath(value);
  const home = ROLE_HOME[role];
  if (!path || !home || home === '/') return '';
  return path === home || path.startsWith(`${home}/`) || path.startsWith(`${home}?`) ? path : '';
}

export function isPostingPath(value) {
  return safeReturnPath(value).startsWith(POSTING_PATH_PREFIX);
}
