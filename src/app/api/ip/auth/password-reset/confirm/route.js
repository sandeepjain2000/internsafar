import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { transaction } from '@/lib/transaction';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = String(body.token || '').trim();
  const newPassword = String(body.newPassword || '');
  if (!token) return NextResponse.json({ error: 'Reset token is required' }, { status: 400 });
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  try {
    await transaction(async (client) => {
      const claim = await client.query(
        `UPDATE ip_password_resets
         SET used_at = now()
         WHERE token = $1
           AND used_at IS NULL
           AND expires_at > now()
         RETURNING id, user_id`,
        [token],
      );
      const row = claim.rows[0];
      if (!row) {
        const err = new Error('invalid_reset');
        err.code = 'INVALID_RESET';
        throw err;
      }
      await client.query(
        `UPDATE ip_users SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [row.user_id, hash],
      );
    });
  } catch (e) {
    if (e?.code === 'INVALID_RESET') {
      return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, message: 'Password updated. You can sign in now.' });
}
