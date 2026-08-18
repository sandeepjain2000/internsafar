import { query } from '@/lib/db';

let schemaReady = false;

/** Idempotent auth-session registry for Account → Active Sessions. */
export async function ensureIpAuthSessionsSchema() {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ip_auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES ip_users(id) ON DELETE CASCADE,
      user_agent TEXT,
      ip TEXT,
      device_label TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_ip_auth_sessions_user
      ON ip_auth_sessions(user_id, revoked_at, last_seen_at DESC)
  `);
  schemaReady = true;
}

export function deviceLabelFromUa(ua = '') {
  const s = String(ua || '');
  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = 'Chrome';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';
  else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(s)) os = 'macOS';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(s)) os = 'iOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  const mobile = /Mobile|Android|iPhone|iPad/i.test(s);
  return `${browser} on ${os}${mobile && !/iOS|Android/i.test(os) ? ' (mobile)' : ''}`;
}

export function isMobileUa(ua = '') {
  return /Mobile|Android|iPhone|iPad/i.test(String(ua || ''));
}
