export const NAV_BADGES_REFRESH_EVENT = 'ip:nav-badges-refresh';

/** Ask PortalShell to refetch sidebar badge counts (e.g. after marking notifications read). */
export function refreshNavBadges() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NAV_BADGES_REFRESH_EVENT));
}
