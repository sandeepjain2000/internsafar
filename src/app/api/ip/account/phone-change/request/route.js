import { createHash, randomInt, randomUUID } from 'crypto';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { sendMail } from '@/lib/mail';
import { ensureIpAccountSettingsSchema } from '@/lib/ensureIpAccountSettingsSchema';

function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '').trim();
}

export async function POST(request) {
  const { session, error } = await requireSession(['candidate']);
  if (error) return error;
  await ensureIpAccountSettingsSchema();
  const body = await request.json().catch(() => ({}));
  const newPhone = normalizePhone(body.newPhone);
  const newCountryCode = String(body.newCountryCode || '+91').trim() || '+91';
  const digits = newPhone.replace(/\D/g, '');
  if (digits.length < 8) return jsonError('Enter a valid mobile number');

  const current = await query(`SELECT email, name FROM ip_users WHERE id = $1`, [session.user.id]);
  const email = current.rows[0]?.email;
  if (!email) return jsonError('Account email missing', 400);

  const cand = await query(`SELECT phone FROM ip_candidates WHERE user_id = $1`, [session.user.id]);
  const oldPhone = cand.rows[0]?.phone || null;
  const combined = `${newCountryCode} ${newPhone}`.replace(/\s+/g, ' ').trim();
  if (oldPhone && String(oldPhone).replace(/\s+/g, '') === combined.replace(/\s+/g, '')) {
    return jsonError('Enter a different phone number');
  }

  const code = String(randomInt(100000, 1000000));
  const codeHash = createHash('sha256').update(code).digest('hex');
  await query(`DELETE FROM ip_phone_change_challenges WHERE user_id = $1 AND used_at IS NULL`, [session.user.id]);
  await query(
    `INSERT INTO ip_phone_change_challenges (id, user_id, old_phone, new_phone, new_country_code, code_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,now() + interval '10 minutes')`,
    [randomUUID(), session.user.id, oldPhone, newPhone, newCountryCode, codeHash],
  );

  try {
    await sendMail({
      to: email,
      subject: 'Confirm your new PlacementHub mobile number',
      text: `Your code to confirm ${combined} is ${code}. It expires in 10 minutes.`,
      html: `<p>Hi ${current.rows[0]?.name || 'there'},</p>
<p>Use this code to confirm your new mobile number <strong>${combined}</strong>:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>
<p>This code expires in 10 minutes. We email this code because SMS delivery is not configured.</p>`,
    });
  } catch (mailErr) {
    console.error('[phone-change request] mail failed', mailErr.message);
    if (mailErr.code === 'MAIL_NOT_CONFIGURED') {
      return jsonError('Email is not configured — cannot send a confirmation code', 503);
    }
    return jsonError('Could not send confirmation code', 500);
  }

  return jsonOk({
    ok: true,
    message: `Confirmation code sent to ${email}. Enter it to save the new number.`,
  });
}
