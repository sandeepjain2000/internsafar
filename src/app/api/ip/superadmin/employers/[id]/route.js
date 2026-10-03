import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { notifyUser } from '@/lib/ipNotify';
import { sendMail } from '@/lib/mail';
import { escapeHtml } from '@/lib/escapeHtml';
import { ensureIpEmployerApprovalSchema } from '@/lib/ensureIpEmployerApprovalSchema';
import { ensureIpEmployerDocumentSlotsSchema } from '@/lib/ipEmployerDocuments';

const ALLOWED = ['approved', 'rejected', 'suspended', 'pending'];

/**
 * Final Employer Approval requires Documents first:
 * at least one approved doc, and no docs still pending review.
 * Employers upload; SuperAdmin reviews in Documents — never implies SA uploads.
 */
export async function assertDocumentsReadyForFinalApproval(employerId) {
  await ensureIpEmployerDocumentSlotsSchema();
  const docs = await query(
    `SELECT coalesce(review_status, 'pending') AS review_status
     FROM ip_employer_documents
     WHERE employer_id = $1 AND superseded_at IS NULL`,
    [employerId],
  );
  if (!docs.rows.length) {
    return {
      ok: false,
      error:
        'This employer has not uploaded any verification documents yet. Ask them to upload under Profile & docs — they will not appear in the Documents tab until they do. After you approve at least one document there, return here for Final Employer Approval.',
    };
  }
  const pending = docs.rows.filter((d) => String(d.review_status).toLowerCase() === 'pending');
  if (pending.length) {
    return {
      ok: false,
      error: `Open the Documents tab and approve this employer's pending document${pending.length === 1 ? '' : 's'} (${pending.length} waiting). Then return here for Final Employer Approval.`,
    };
  }
  const approved = docs.rows.filter((d) => String(d.review_status).toLowerCase() === 'approved');
  if (!approved.length) {
    return {
      ok: false,
      error:
        'Open the Documents tab and approve at least one verification document for this employer. Then return here for Final Employer Approval.',
    };
  }
  return { ok: true, approvedCount: approved.length };
}

/**
 * Restore (Suspended → approved) keeps the earlier Final Approval but waits for SuperAdmin
 * to review any document still pending. Rejecting also clears it: a suspended employer
 * cannot sign in to replace a bad document, so requiring approval alone could never unblock.
 */
async function assertNoPendingDocumentsForRestore(employerId, companyName) {
  await ensureIpEmployerDocumentSlotsSchema();
  const pending = await query(
    `SELECT count(*)::int AS n FROM ip_employer_documents
     WHERE employer_id = $1 AND superseded_at IS NULL
       AND coalesce(review_status, 'pending') = 'pending'`,
    [employerId],
  );
  const n = pending.rows[0]?.n || 0;
  if (!n) return { ok: true };
  const who = companyName || 'This employer';
  const docs = n === 1 ? '1 document' : `${n} documents`;
  const them = n === 1 ? 'it' : 'them';
  return {
    ok: false,
    error: `Cannot restore ${who}: ${docs} still waiting for review. Open the Documents tab and approve ${them} (or reject if invalid), then return here and Restore.`,
  };
}

function statusTitle(status) {
  if (status === 'approved') return 'Final Employer Approval Granted';
  if (status === 'rejected') return 'Employer Account Rejected';
  if (status === 'suspended') return 'Employer Account Suspended';
  if (status === 'pending') return 'Employer Account Set To Pending';
  return `Employer Account ${status}`;
}

async function setOneStatus(id, status, rejectionReason, reviewerId) {
  const cur = await query(`SELECT approval_status, company_name FROM ip_employers WHERE id = $1`, [id]);
  if (!cur.rows[0]) return { ok: false, error: 'not_found' };
  const current = String(cur.rows[0].approval_status || '');

  // Suspend only applies to approved employers, so a suspended employer has already passed Final Approval.
  if (status === 'suspended' && current !== 'approved' && current !== 'suspended') {
    return { ok: false, error: 'Only approved employers can be suspended.' };
  }
  if (status === 'approved' && current === 'suspended') {
    const gate = await assertNoPendingDocumentsForRestore(id, cur.rows[0].company_name);
    if (!gate.ok) return { ok: false, error: gate.error };
  } else if (status === 'approved') {
    const gate = await assertDocumentsReadyForFinalApproval(id);
    if (!gate.ok) return { ok: false, error: gate.error };
  }

  const result = await query(
    `UPDATE ip_employers
     SET approval_status = $2,
         rejection_reason = CASE WHEN $2 = 'rejected' THEN $3 ELSE NULL END,
         approval_reviewed_at = now(),
         approval_reviewed_by = $4,
         updated_at = now()
     WHERE id = $1
     RETURNING user_id, company_name`,
    [id, status, rejectionReason || null, reviewerId || null],
  );
  const row = result.rows[0];
  if (!row) return { ok: false, error: 'not_found' };

  // Delete (softDeleteOne) turns the login off; approving or re-opening the employer turns it back on.
  if (status === 'approved' || status === 'pending') {
    await query(
      `UPDATE ip_users SET active = true, updated_at = now() WHERE id = $1 AND active = false`,
      [row.user_id],
    );
  }

  const reasonLine =
    status === 'rejected' && rejectionReason
      ? `<p><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>`
      : '';

  const restored = status === 'approved' && current === 'suspended';
  const title = restored ? 'Employer Account Restored' : statusTitle(status);
  const body = restored
    ? `${row.company_name}: Your Employer Account Has Been Restored. You Can Sign In And Post Again.`
    : status === 'approved'
      ? `${row.company_name}: Final Employer Approval Is Complete. You Can Sign In And Post When Your Profile And Email Are Ready.`
      : rejectionReason
        ? `${row.company_name}: ${rejectionReason}`
        : row.company_name;

  await notifyUser({
    userId: row.user_id,
    title,
    body,
    link: '/employer',
    category: 'system',
    forceEmail: true,
    skipEmail: true,
  });
  try {
    const emailRow = await query(`SELECT email, name FROM ip_users WHERE id = $1`, [row.user_id]);
    await sendMail({
      to: emailRow.rows[0]?.email,
      subject: title,
      html: `<p>Hi ${escapeHtml(emailRow.rows[0]?.name || '')},</p><p>${escapeHtml(body)}</p>${reasonLine}<p><a href="/employer">Open Employer Portal</a></p>`,
      text: `${body}${rejectionReason ? `\nReason: ${rejectionReason}` : ''}`,
    });
  } catch (e) {
    console.error('[superadmin employer status] mail failed', e.message);
  }
  return { ok: true };
}

export async function PATCH(request, { params }) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpEmployerApprovalSchema();
  const { id: routeId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  if (body.action === 'resetEthics' || body.resetEthics === true) {
    const ids = Array.isArray(body.ids)
      ? body.ids.map(String).filter(Boolean)
      : [String(routeId || body.id || '')].filter(Boolean);
    if (!ids.length) return jsonError('Id Required');
    let ok = 0;
    for (const id of ids) {
      const emp = await query(
        `UPDATE ip_employers
         SET ethics_acks = '{}'::jsonb,
             ethics_accepted_at = null,
             updated_at = now()
         WHERE id = $1
         RETURNING user_id`,
        [id],
      );
      if (!emp.rows[0]) continue;
      await query(
        `UPDATE ip_users SET profile_complete = false, updated_at = now() WHERE id = $1`,
        [emp.rows[0].user_id],
      );
      ok += 1;
    }
    if (!ok) return jsonError('Not Found', 404);
    return jsonOk({ ok: true, processed: ok, action: 'resetEthics' });
  }

  const status = String(body.approvalStatus || '');
  if (!ALLOWED.includes(status)) return jsonError(`approvalStatus Must Be One Of ${ALLOWED.join(', ')}`);

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(routeId || body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('Id Required');

  const rejectionReason = String(body.rejectionReason || body.reason || '').trim();

  let ok = 0;
  const failures = [];
  for (const id of ids) {
    const res = await setOneStatus(id, status, rejectionReason, session.user.id);
    if (res.ok) ok += 1;
    else failures.push({ id, error: res.error || 'Failed' });
  }
  if (!ok) {
    const msg = failures[0]?.error || 'Not Found';
    return jsonError(msg, failures[0]?.error === 'not_found' ? 404 : 400);
  }
  return jsonOk({ ok: true, processed: ok, failures });
}

async function softDeleteOne(employerId) {
  const emp = await query(`SELECT id, user_id, company_name FROM ip_employers WHERE id = $1`, [employerId]);
  const row = emp.rows[0];
  if (!row) return { ok: false, error: 'not_found' };
  await query(
    `UPDATE ip_employers
     SET approval_status = 'rejected',
         rejection_reason = 'Deleted By SuperAdmin',
         approval_reviewed_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [employerId],
  );
  await query(`UPDATE ip_users SET active = false, updated_at = now() WHERE id = $1`, [row.user_id]);
  return { ok: true };
}

export async function DELETE(request, { params }) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;
  await ensureIpEmployerApprovalSchema();
  const { id: routeId } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [String(routeId || body.id || '')].filter(Boolean);
  if (!ids.length) return jsonError('Id Required');

  let ok = 0;
  const failures = [];
  for (const id of ids) {
    const res = await softDeleteOne(id);
    if (res.ok) ok += 1;
    else failures.push({ id, error: res.error });
  }
  if (!ok) return jsonError('Not Found', 404);
  return jsonOk({ ok: true, processed: ok, failures });
}
