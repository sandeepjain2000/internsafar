const MAX_LEN = 2000;

/**
 * Parse an optional interview meeting URL. Empty is allowed (phone / in-person).
 * Never invent a Meet link — only store what the employer submitted.
 */
export function parseInterviewMeetUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { ok: true, url: null };
  if (s.length > MAX_LEN) return { ok: false, error: 'Meeting URL is too long' };
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: 'Meeting URL must be a valid https link' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, error: 'Meeting URL must use https' };
  }
  return { ok: true, url: parsed.toString() };
}

export function isStoredMeetUrl(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function meetJoinLabel(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    if (host === 'meet.google.com' || host.endsWith('.meet.google.com')) return 'Join Google Meet';
    if (host.includes('zoom.')) return 'Join Zoom';
    if (host.includes('teams.microsoft.com') || host.includes('teams.live.com')) return 'Join Teams';
  } catch {
    /* ignore */
  }
  return 'Join interview';
}
