import { createHash, randomInt, randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { sendMail } from '@/lib/mail';
import { ensureIpCandidateProfileSchema } from '@/lib/ensureIpCandidateProfileSchema';

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpCandidateProfileSchema();
  const body = await request.json().catch(() => ({}));
  const newEmail = String(body.newEmail || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return jsonError('Enter a valid new email');

  const existing = await query(`SELECT id FROM ip_users WHERE lower(email) = $1 AND id <> $2`, [newEmail, session.user.id]);
  if (existing.rows[0]) return jsonError('That email is already in use', 409);
  const current = await query(`SELECT email FROM ip_users WHERE id = $1`, [session.user.id]);
  const oldEmail = current.rows[0]?.email;
  if (!oldEmail || oldEmail.toLowerCase() === newEmail) return jsonError('Enter a different email');

  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash('sha256').update(code).digest('hex');
  await query(`DELETE FROM ip_email_change_challenges WHERE user_id = $1 AND used_at IS NULL`, [session.user.id]);
  await query(
    `INSERT INTO ip_email_change_challenges (id, user_id, old_email, new_email, code_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,now() + interval '10 minutes')`,
    [randomUUID(), session.user.id, oldEmail, newEmail, codeHash],
  );
  await sendMail({
    to: newEmail,
    subject: 'Verify your new PlacementHub email',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
  return jsonOk({ ok: true, message: 'Verification code sent to the new email.' });
}
