import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/apiAuth';
import { revokeOtherAuthSessions } from '@/lib/ipAuthSessions';

function passwordMeetsRules(pw) {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError('Sign in required', 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 8) return jsonError('New password must be at least 8 characters');
  if (!passwordMeetsRules(newPassword)) {
    return jsonError(
      'New password must include at least 1 uppercase letter, 1 number, and 1 special character',
    );
  }

  const result = await query(`SELECT id, password_hash FROM ip_users WHERE id = $1 LIMIT 1`, [session.user.id]);
  const user = result.rows[0];
  if (!user) return jsonError('User not found', 404);

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return jsonError('Current password is incorrect', 400);

  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE ip_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [user.id, hash]);

  let signedOutOthers = false;
  if (body.signOutOthers) {
    const keep = session.user.sessionId;
    if (keep) {
      await revokeOtherAuthSessions({ userId: session.user.id, keepSessionId: keep });
      signedOutOthers = true;
    }
  }

  return jsonOk({ ok: true, signedOutOthers });
}
