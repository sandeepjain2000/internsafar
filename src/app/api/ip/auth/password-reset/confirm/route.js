import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

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

  const result = await query(
    `SELECT id, user_id, expires_at, used_at FROM ip_password_resets WHERE token = $1 LIMIT 1`,
    [token],
  );
  const row = result.rows[0];
  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query(`UPDATE ip_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [row.user_id, hash]);
  await query(`UPDATE ip_password_resets SET used_at = now() WHERE id = $1`, [row.id]);

  return NextResponse.json({ ok: true, message: 'Password updated. You can sign in now.' });
}
