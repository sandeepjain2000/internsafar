import { query } from '@/lib/db';

let ready = false;

export async function ensureIpLoginReportSchema() {
  if (ready) return;
  await query(`ALTER TABLE ip_login_events ADD COLUMN IF NOT EXISTS ip_address TEXT`);
  await query(`ALTER TABLE ip_login_events ADD COLUMN IF NOT EXISTS user_agent TEXT`);
  await query(`ALTER TABLE ip_login_events ADD COLUMN IF NOT EXISTS auth_method TEXT`);
  await query(`ALTER TABLE ip_login_events ADD COLUMN IF NOT EXISTS failure_reason TEXT`);
  await query(`ALTER TABLE ip_login_events ADD COLUMN IF NOT EXISTS location TEXT`);
  ready = true;
}

/** Lightweight UA → "OS • Browser" label. */
export function deviceLabelFromUa(ua) {
  const s = String(ua || '');
  let os = 'Unknown OS';
  if (/Windows NT 10/i.test(s)) os = 'Windows 10/11';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Mac OS X/i.test(s)) os = 'Mac OS X';
  else if (/Android/i.test(s)) os = 'Android';
  else if (/iPhone|iPad/i.test(s)) os = 'iOS';
  else if (/Linux/i.test(s)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(s)) browser = 'Edge';
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = 'Chrome';
  else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = 'Safari';
  else if (/Firefox\//i.test(s)) browser = 'Firefox';

  return `${os} • ${browser}`;
}
