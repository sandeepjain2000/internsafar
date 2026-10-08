import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { transaction } from '@/lib/transaction';
import { hashPasswordResetToken } from '@/lib/ipPasswordResetToken';
import { ensureIpCoreAccountSchema, isCoreAccount } from '@/lib/ipCoreAccount';

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
  await ensureIpCoreAccountSchema();
  try {
    await transaction(async (client) => {
      // Links issued before hashing stored the raw token (32 chars); never accept a stored 64-char hash as input.
      const claim = await client.query(
        `UPDATE ip_password_resets
         SET used_at = now()
         WHERE (token = $1 OR (token = $2 AND length(token) <> 64))
           AND used_at IS NULL
           AND expires_at > now()
         RETURNING id, user_id`,
        [hashPasswordResetToken(token), token],
      );
      const row = claim.rows[0];
      if (!row) {
        const err = new Error('invalid_reset');
        err.code = 'INVALID_RESET';
        throw err;
      }
      await client.query(
        `UPDATE ip_password_resets SET used_at = now()
         WHERE user_id = $1 AND used_at IS NULL AND id <> $2`,
        [row.user_id, row.id],
      );
      // Core (shared demo) accounts: the link is spent and the reply is the same, but nothing else changes.
      if (await isCoreAccount(row.user_id, client)) return;
      await client.query(
        `UPDATE ip_users SET password_hash = $2, updated_at = now() WHERE id = $1`,
        [row.user_id, hash],
      );
      await client.query('SAVEPOINT revoke_sessions');
      try {
        await client.query(
          `UPDATE ip_auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
          [row.user_id],
        );
      } catch (revokeErr) {
        await client.query('ROLLBACK TO SAVEPOINT revoke_sessions');
        console.warn('[password-reset confirm] session revoke skipped', revokeErr.message);
      }
    });
  } catch (e) {
    if (e?.code === 'INVALID_RESET') {
      return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true, message: 'Password updated. You can sign in now.' });
}
