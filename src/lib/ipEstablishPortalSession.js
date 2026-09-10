import { encode } from 'next-auth/jwt';
import { headers } from 'next/headers';
import { query } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createAuthSession } from '@/lib/ipAuthSessions';
import { ROLE_HOME } from '@/lib/roleHome';

/** Match src/lib/auth.js session ceilings. */
const SESSION_SHORT_SEC = 60 * 60 * 12;
const SESSION_LONG_SEC = 60 * 60 * 24 * 30;

async function requestMeta() {
  try {
    const h = await headers();
    const ua = h.get('user-agent') || '';
    const fwd = h.get('x-forwarded-for') || '';
    const ip = (fwd.split(',')[0] || h.get('x-real-ip') || '').trim();
    return { ua, ip };
  } catch {
    return { ua: '', ip: '' };
  }
}

async function recordLoginEvent({ userId, email, role, authMethod }) {
  try {
    const { ensureIpLoginReportSchema } = await import('@/lib/ensureIpLoginReportSchema');
    await ensureIpLoginReportSchema();
    const { ua, ip } = await requestMeta();
    await query(
      `INSERT INTO ip_login_events
         (id, user_id, email, role, success, ip_address, user_agent, auth_method, failure_reason)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7,null)`,
      [
        newId('ip_login'),
        userId || null,
        email,
        role || null,
        ip || null,
        ua ? String(ua).slice(0, 500) : null,
        authMethod || 'Google OAuth',
      ],
    );
  } catch (e) {
    console.error('[ip auth] login event write failed', e.message);
  }
}

/**
 * Establish a normal NextAuth JWT session for an already-verified portal user.
 * Reuses the same JWT claims + ip_auth_sessions row shape as credentials/Google login
 * in src/lib/auth.js (jwt callback). Sets the session cookie on `response`.
 *
 * Call only after trusted server-side identity work (e.g. consumed Google verification
 * + linked ip_google_identities). Never treat a registration verification token as the
 * session credential.
 */
export async function attachPortalSessionCookie(
  response,
  { userId, rememberMe = true, authMethod = 'Google OAuth' },
) {
  if (!userId) return { ok: false, error: 'missing_user' };
  if (!process.env.NEXTAUTH_SECRET) {
    console.error('[ip auth] NEXTAUTH_SECRET missing; cannot establish session');
    return { ok: false, error: 'missing_secret' };
  }

  const result = await query(
    `SELECT id, email, role, name, active, profile_complete, form_approval_status
     FROM ip_users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const user = result.rows[0];
  if (!user) return { ok: false, error: 'not_found' };
  if (user.active === false) return { ok: false, error: 'inactive' };

  const { ua, ip } = await requestMeta();
  let sid;
  try {
    sid = await createAuthSession({ userId: user.id, userAgent: ua, ip });
  } catch (e) {
    console.error('[ip auth] post-register session create failed', e.message);
    return { ok: false, error: 'session_row' };
  }

  const authTime = Math.floor(Date.now() / 1000);
  const maxAge = rememberMe ? SESSION_LONG_SEC : SESSION_SHORT_SEC;
  let jwt;
  try {
    jwt = await encode({
      token: {
        name: user.name,
        email: user.email,
        sub: user.id,
        role: user.role,
        uid: user.id,
        profileComplete: user.profile_complete,
        rememberMe: Boolean(rememberMe),
        authTime,
        sid,
      },
      secret: process.env.NEXTAUTH_SECRET,
      maxAge,
    });
  } catch (e) {
    console.error('[ip auth] post-register jwt encode failed', e.message);
    return { ok: false, error: 'encode' };
  }

  const useSecure =
    String(process.env.NEXTAUTH_URL || '').startsWith('https://') ||
    process.env.NODE_ENV === 'production';
  const cookieName = useSecure
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  response.cookies.set(cookieName, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: useSecure,
    maxAge,
  });

  await query(`UPDATE ip_users SET last_login_at = now() WHERE id = $1`, [user.id]).catch(() => {});
  await recordLoginEvent({
    userId: user.id,
    email: user.email,
    role: user.role,
    authMethod,
  });

  return {
    ok: true,
    redirectTo: ROLE_HOME[user.role] || '/',
    role: user.role,
  };
}
