import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { sendMail } from '@/lib/mail';
import { ensureIpFormRegistrationSchema } from '@/lib/ensureIpFormRegistrationSchema';
import {
  creditReferralForReferredUser,
  ensureIpReferralExtraSchema,
  invalidateReferralForReferredUser,
} from '@/lib/ipReferralCredit';

async function approveOne(userId) {
  const row = await query(
    `SELECT id, email, name, form_approval_status FROM ip_users
     WHERE id = $1 AND role = 'candidate' AND registration_source = 'form'`,
    [userId],
  );
  const user = row.rows[0];
  if (!user) return { ok: false, error: 'not_found' };
  if (user.form_approval_status !== 'pending') return { ok: false, error: 'already_processed' };
  await query(
    `UPDATE ip_users
     SET active = true, form_approval_status = 'approved', updated_at = now()
     WHERE id = $1`,
    [userId],
  );
  await creditReferralForReferredUser(userId).catch((e) => {
    console.error('[form-registrations] referral credit', e.message);
  });
  try {
    await sendMail({
      to: user.email,
      subject: 'Your Internship Portal candidate account is approved',
      html: `<p>Hi ${user.name},</p><p>Your candidate registration was approved. Sign in with the Gmail and password you chose at registration.</p>`,
      text: `Hi ${user.name},\nYour candidate registration was approved.`,
    });
  } catch (e) {
    console.error('[form-registrations candidate] mail', e.message);
  }
  return { ok: true };
}

async function rejectOne(userId) {
  const row = await query(
    `SELECT id, form_approval_status FROM ip_users
     WHERE id = $1 AND role = 'candidate' AND registration_source = 'form'`,
    [userId],
  );
  const user = row.rows[0];
  if (!user) return { ok: false, error: 'not_found' };
  if (user.form_approval_status !== 'pending') return { ok: false, error: 'already_processed' };
  await query(
    `UPDATE ip_users
     SET active = false, form_approval_status = 'rejected', updated_at = now()
     WHERE id = $1`,
    [userId],
  );
  await invalidateReferralForReferredUser(userId, 'registration_rejected').catch((e) => {
    console.error('[form-registrations] referral invalidate', e.message);
  });
  return { ok: true };
}

/** List candidate form registrations (+ optional KPIs). */
export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpFormRegistrationSchema();
  await ensureIpReferralExtraSchema();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'pending';
  const withMeta = searchParams.get('meta') === '1';

  const result = await query(
    `SELECT u.id, u.email, u.name, u.created_at, u.form_approval_status, u.active, u.registration_source,
            c.college, c.graduation_year, c.phone, c.degree, c.cgpa
     FROM ip_users u
     LEFT JOIN ip_candidates c ON c.user_id = u.id
     WHERE u.role = 'candidate'
       AND u.registration_source = 'form'
       AND ($1 = '' OR u.form_approval_status = $1)
     ORDER BY u.created_at DESC
     LIMIT 500`,
    [status === 'all' ? '' : status],
  );

  if (!withMeta) return jsonOk({ items: result.rows });

  const [pendingCand, pendingEmp, googleAuto, activeUsers, approvedToday] = await Promise.all([
    query(
      `SELECT count(*)::int AS n FROM ip_users
       WHERE role = 'candidate' AND registration_source = 'form' AND form_approval_status = 'pending'`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_employer_requests WHERE status = 'pending'`),
    query(
      `SELECT count(*)::int AS n FROM ip_users
       WHERE registration_source = 'google' AND coalesce(active,true) = true`,
    ),
    query(`SELECT count(*)::int AS n FROM ip_users WHERE coalesce(active,true) = true`),
    query(
      `SELECT count(*)::int AS n FROM ip_users
       WHERE registration_source = 'form' AND form_approval_status = 'approved'
         AND updated_at >= date_trunc('day', now())`,
    ),
  ]);

  return jsonOk({
    items: result.rows,
    meta: {
      pendingCandidates: pendingCand.rows[0].n,
      pendingEmployers: pendingEmp.rows[0].n,
      autoApprovedGoogle: googleAuto.rows[0].n,
      totalActiveUsers: activeUsers.rows[0].n,
      approvedToday: approvedToday.rows[0].n,
    },
  });
}

/** Approve or reject one or many form-registered candidates. */
export async function PATCH(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpFormRegistrationSchema();
  await ensureIpReferralExtraSchema();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const status = String(body.status || '');
  if (!['approved', 'rejected'].includes(status)) return jsonError('Invalid status');

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(body.id || body.userId || '')].filter(Boolean);
  if (!ids.length) return jsonError('id or ids required');

  let ok = 0;
  const failures = [];
  for (const id of ids) {
    const res = status === 'approved' ? await approveOne(id) : await rejectOne(id);
    if (res.ok) ok += 1;
    else failures.push({ id, error: res.error });
  }

  if (!ok && failures.length) {
    return jsonError(failures[0].error === 'already_processed' ? 'Already processed' : 'Not found', 404);
  }

  return jsonOk({
    ok: true,
    processed: ok,
    failures,
    message: status === 'approved' ? `Approved ${ok} candidate(s)` : `Rejected ${ok} candidate(s)`,
    reviewer: session.user.id,
  });
}
