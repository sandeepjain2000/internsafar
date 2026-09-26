import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { awardPoints, notifyUser } from '@/lib/ipNotify';

const ROLES = ['candidate', 'employer'];

/**
 * Search candidate/employer accounts for SuperAdmin points adjustment.
 * GET ?q=&role=candidate|employer| (empty = both)
 */
export async function GET(request) {
  const { error } = await requireSession(['superadmin']);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = String(searchParams.get('q') || '').trim();
  const role = String(searchParams.get('role') || '').trim().toLowerCase();
  const params = [];
  const where = [`u.role IN ('candidate', 'employer')`, `u.active = true`];

  if (role && ROLES.includes(role)) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(u.email) LIKE $${i} OR lower(coalesce(u.name, '')) LIKE $${i} OR lower(coalesce(e.company_name, '')) LIKE $${i})`,
    );
  }

  const result = await query(
    `SELECT u.id, u.email, u.name, u.role, u.points, u.created_at,
            e.company_name, e.approval_status
     FROM ip_users u
     LEFT JOIN ip_employers e ON e.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY u.created_at DESC
     LIMIT 100`,
    params,
  );

  return jsonOk({
    items: result.rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name || r.company_name || '—',
      role: r.role,
      points: Number(r.points || 0),
      companyName: r.company_name || null,
      approvalStatus: r.approval_status || null,
      createdAt: r.created_at,
    })),
  });
}

/**
 * Manually add or deduct reward points (support/goodwill).
 * Body: { userId, delta: number (nonzero int), note: string required }
 * Deduct cannot take balance below 0. No per-action cap.
 */
export async function POST(request) {
  const { session, error } = await requireSession(['superadmin']);
  if (error) return error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }

  const userId = String(body.userId || '').trim();
  const note = String(body.note || body.reason || '').trim();
  const deltaRaw = body.delta;
  const delta = Number(deltaRaw);

  if (!userId) return jsonError('userId is required');
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    return jsonError('delta must be a non-zero integer');
  }
  if (!note) return jsonError('Note / reason is required');

  const user = await query(
    `SELECT id, email, name, role, points, active
     FROM ip_users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  const row = user.rows[0];
  if (!row) return jsonError('User not found', 404);
  if (!ROLES.includes(String(row.role || ''))) {
    return jsonError('Only candidate or employer accounts can be adjusted');
  }
  if (row.active === false) return jsonError('User account is inactive', 400);

  const before = Number(row.points || 0);
  let applied = delta;
  if (delta < 0 && before + delta < 0) {
    return jsonError(
      `Cannot deduct ${Math.abs(delta)} points — balance is ${before} (would go below 0)`,
      400,
    );
  }

  const reason = delta > 0 ? 'sa_manual_credit' : 'sa_manual_debit';
  await awardPoints({
    userId,
    delta: applied,
    reason,
    meta: {
      note,
      byUserId: session.user.id,
      byEmail: session.user.email || null,
      balanceBefore: before,
    },
  });

  const afterRes = await query(`SELECT points FROM ip_users WHERE id = $1`, [userId]);
  const after = Number(afterRes.rows[0]?.points || 0);

  const abs = Math.abs(applied);
  const title = delta > 0 ? 'Points Added' : 'Points Adjusted';
  const bodyText =
    delta > 0
      ? `Admin has added ${abs} point${abs === 1 ? '' : 's'} to your account.`
      : `Admin has removed ${abs} point${abs === 1 ? '' : 's'} from your account.`;

  try {
    await notifyUser({
      userId,
      title,
      body: bodyText,
      link: row.role === 'employer' ? '/employer' : '/candidate',
      category: 'system',
    });
  } catch (e) {
    console.error('[sa points] notify', e.message);
  }

  return jsonOk({
    ok: true,
    userId,
    delta: applied,
    balanceBefore: before,
    balanceAfter: after,
    reason,
  });
}
