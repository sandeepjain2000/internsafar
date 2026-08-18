import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId, randomPassword, referralCodeFrom } from '@/lib/ids';
import { sendMail, tempPasswordEmailHtml } from '@/lib/mail';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';

export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpFormRegistrationSchema();
  await ensureIpEmployerApprovalSchema();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const withMeta = searchParams.get('meta') === '1';
  const where = status ? `WHERE status = $1` : '';
  const params = status ? [status] : [];
  const result = await query(
    `SELECT * FROM ip_employer_requests ${where} ORDER BY created_at DESC LIMIT 500`,
    params,
  );

  if (!withMeta) return jsonOk({ items: result.rows });

  const [pending, approvedWeek, rejected] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM ip_employer_requests WHERE status = 'pending'`),
    query(
      `SELECT count(*)::int AS n FROM ip_employer_requests
       WHERE status = 'approved'
         AND coalesce(reviewed_at, created_at) >= now() - interval '7 days'`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_employer_requests WHERE status = 'rejected'`),
  ]);

  return jsonOk({
    items: result.rows,
    meta: {
      pending: pending.rows[0].n,
      approvedThisWeek: approvedWeek.rows[0].n,
      rejected: rejected.rows[0].n,
    },
  });
}

/** SuperAdmin creates an employer account from a manual request. */
export async function POST(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpFormRegistrationSchema();
  await ensureIpEmployerApprovalSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const requestId = String(body.requestId || '');
  const req = await query(`SELECT * FROM ip_employer_requests WHERE id = $1`, [requestId]);
  const row = req.rows[0];
  if (!row) return jsonError('Request not found', 404);
  if (row.status !== 'pending') return jsonError('Request already processed', 409);

  const existing = await query(`SELECT id FROM ip_users WHERE lower(email) = $1`, [
    row.contact_email.toLowerCase(),
  ]);
  if (existing.rows[0]) return jsonError('An account with this email already exists', 409);

  const usedChosenPassword = Boolean(row.password_hash);
  const password = usedChosenPassword ? null : randomPassword(12);
  const hash = row.password_hash || (await bcrypt.hash(password, 10));
  const userId = newId('ip_user');
  const employerId = newId('ip_emp');
  const name = row.contact_name || row.company_name;

  await query('BEGIN');
  try {
    await query(
      `INSERT INTO ip_users (
         id, email, password_hash, role, name, points, free_post_credits, referral_code,
         registration_source, form_approval_status, active
       ) VALUES ($1,$2,$3,'employer',$4,50,1,$5,'form','approved',true)`,
      [userId, row.contact_email, hash, name, referralCodeFrom(name)],
    );
    await query(
      `INSERT INTO ip_employers (
         id, user_id, company_name, website, work_email, contact_name, contact_designation, approval_status,
         approval_reviewed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'approved', now())`,
      [
        employerId,
        userId,
        row.company_name,
        row.website,
        row.contact_email,
        row.contact_name,
        row.contact_designation || null,
      ],
    );
    await query(
      `UPDATE ip_employer_requests
       SET status = 'approved', created_user_id = $2, reviewed_at = now(), reviewer_id = $3,
           rejection_reason = NULL
       WHERE id = $1`,
      [requestId, userId, session.user.id],
    );
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }

  try {
    if (usedChosenPassword) {
      await sendMail({
        to: row.contact_email,
        subject: 'Your Internship Portal employer account is approved',
        html: `<p>Hi ${name},</p><p>Your employer account for <strong>${row.company_name}</strong> was approved. Sign in with the password you chose at registration.</p>`,
        text: `Hi ${name},\nYour employer account was approved. Sign in with the password you chose at registration.`,
      });
    } else {
      await sendMail({
        to: row.contact_email,
        subject: 'Your Internship Portal employer account is ready',
        html: tempPasswordEmailHtml({ name, email: row.contact_email, password }),
        text: `Temporary password: ${password}`,
      });
    }
  } catch (e) {
    console.error('[superadmin requests] mail failed', e.message);
  }

  return jsonOk({ ok: true, userId, employerId, usedChosenPassword });
}

/** SuperAdmin rejects a manual employer request (optional reason emailed). */
export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpEmployerApprovalSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const requestId = String(body.id || body.requestId || '');
  const status = String(body.status || 'rejected');
  if (!requestId) return jsonError('id is required');
  if (!['approved', 'rejected'].includes(status)) return jsonError('Invalid status');

  if (status === 'approved') {
    return POST(
      new Request(request.url, {
        method: 'POST',
        body: JSON.stringify({ requestId }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const rejectionReason = String(body.rejectionReason || body.reason || '').trim();
  const result = await query(
    `UPDATE ip_employer_requests
     SET status = 'rejected', reviewed_at = now(), reviewer_id = $2,
         rejection_reason = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING id, contact_email, contact_name, company_name`,
    [requestId, session.user.id, rejectionReason || null],
  );
  if (!result.rows.length) return jsonError('Request not found or already processed', 404);

  const row = result.rows[0];
  try {
    const reasonLine = rejectionReason
      ? `<p><strong>Reason:</strong> ${rejectionReason.replace(/</g, '&lt;')}</p>`
      : '';
    await sendMail({
      to: row.contact_email,
      subject: 'Your Internship Portal employer request was not approved',
      html: `<p>Hi ${row.contact_name || ''},</p><p>Your request for <strong>${row.company_name}</strong> was not approved.</p>${reasonLine}`,
      text: `Your employer request was not approved.${rejectionReason ? `\nReason: ${rejectionReason}` : ''}`,
    });
  } catch (e) {
    console.error('[superadmin requests reject] mail failed', e.message);
  }

  return jsonOk({ ok: true, message: 'Request rejected' });
}
