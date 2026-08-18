import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';

const ALLOWED = ['approved', 'rejected', 'suspended', 'pending'];

async function setOneStatus(id, status, rejectionReason) {
  const result = await query(
    `UPDATE ip_employers
     SET approval_status = $2,
         rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
         approval_reviewed_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING user_id, company_name`,
    [id, status, rejectionReason || null],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'not_found' };

  const reasonLine =
    status === 'rejected' && rejectionReason
      ? `<p><strong>Reason:</strong> ${String(rejectionReason).replace(/</g, '&lt;')}</p>`
      : '';

  await notifyUser({
    userId: row.user_id,
    title: `Employer account ${status}`,
    body: rejectionReason ? `${row.company_name}: ${rejectionReason}` : row.company_name,
    link: '/employer',
    category: 'system',
  });
  try {
    const emailRow = await query(`SELECT email, name FROM ip_users WHERE id = $1`, [row.user_id]);
    await sendMail({
      to: emailRow.rows[0]?.email,
      subject: `Your employer account was ${status}`,
      html: `<p>Hi ${emailRow.rows[0]?.name || ''},</p><p>Your Internship Portal employer account (${row.company_name}) status is now: <strong>${status}</strong>.</p>${reasonLine}`,
      text: `Your employer account status: ${status}${rejectionReason ? `\nReason: ${rejectionReason}` : ''}`,
    });
  } catch (e) {
    console.error('[superadmin employer status] mail failed', e.message);
  }
  return { ok: true };
}

export async function PATCH(request, { params }) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpEmployerApprovalSchema();
  const { id: routeId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const status = String(body.approvalStatus || '');
  if (!ALLOWED.includes(status)) return jsonError(`approvalStatus must be one of ${ALLOWED.join(', ')}`);

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(routeId || body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('id required');

  const rejectionReason = String(body.rejectionReason || body.reason || '').trim();
  if (status === 'rejected' && !rejectionReason && !Array.isArray(body.ids)) {
    // Single reject from UI should include a reason; allow empty for bulk/legacy
  }

  let ok = 0;
  const failures = [];
  for (const id of ids) {
    const res = await setOneStatus(id, status, rejectionReason);
    if (res.ok) ok += 1;
    else failures.push({ id, error: res.error });
  }
  if (!ok) return jsonError('Not found', 404);
  return jsonOk({ ok: true, processed: ok, failures });
}
