import { query } from '@/lib/db';
import { requireSession, jsonOk } from '@/lib/apiAuth';

/** Resolve referral code to referrer display name (for registration UI). */
export async function GET(request) {
  const code = (new URL(request.url).searchParams.get('code') || '').trim();
  if (!code) return jsonOk({ found: false });
  const result = await query(
    `SELECT name, role FROM ip_users WHERE referral_code = $1 LIMIT 1`,
    [code],
  );
  if (!result.rows[0]) return jsonOk({ found: false });
  return jsonOk({ found: true, name: result.rows[0].name, role: result.rows[0].role });
}
