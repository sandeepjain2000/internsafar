import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { chargePublishPoints } from '@/lib/chargePublishPoints';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT i.*, (SELECT count(*) FROM ip_applications a WHERE a.internship_id = i.id) as applicant_count
     FROM ip_internships i WHERE i.employer_id = $1 ORDER BY i.created_at DESC`,
    [emp.rows[0].id],
  );
  return jsonOk({ items: result.rows });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;

  const profileGate = await query(`SELECT profile_complete FROM ip_users WHERE id = $1`, [session.user.id]);
  if (!profileGate.rows[0]?.profile_complete) {
    return jsonError('Complete your employer profile before posting', 403);
  }

  const emp = await query(`SELECT id, approval_status FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonError('Employer profile missing', 404);
  if (emp.rows[0].approval_status !== 'approved') {
    return jsonError('Your employer account must be approved by SuperAdmin before posting', 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const title = String(body.title || '').trim();
  if (!title) return jsonError('Title is required');

  const publishing = body.status !== 'draft';
  if (publishing) {
    const spendErr = await chargePublishPoints(session.user.id, { action: 'create_publish' });
    if (spendErr) {
      return jsonError(`${spendErr} Or save as draft.`, 403);
    }
  }

  const engagementType = body.engagementType || body.engagement_type || null;
  const stipendType = body.stipendType || body.stipend_type || null;
  const weeklyHours = body.weeklyHours ?? body.weekly_hours ?? null;
  const incentiveBasis = body.incentiveBasis || body.incentive_basis || null;

  const id = newId('ip_int');
  await query(
    `INSERT INTO ip_internships (
       id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
       start_date, end_date, eligibility, questions, status, show_employer_identity,
       work_hours_start, work_hours_end, engagement_type, weekly_hours, stipend_type, incentive_basis
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      id, emp.rows[0].id, title, body.description || '', body.location || '', body.workMode || 'Remote',
      body.stipendInr || null, body.durationMonths || null, body.startDate || null, body.endDate || null,
      JSON.stringify(body.eligibility || {}), JSON.stringify(body.questions || []),
      publishing ? 'published' : 'draft',
      body.showEmployerIdentity !== false,
      body.workHoursStart || body.work_hours_start || null,
      body.workHoursEnd || body.work_hours_end || null,
      engagementType || null,
      engagementType === 'part_time' && weeklyHours !== '' && weeklyHours != null ? Number(weeklyHours) : null,
      stipendType || null,
      stipendType === 'incentive' ? (incentiveBasis || null) : null,
    ],
  );

  return jsonOk({ ok: true, id, pointsCharged: publishing ? POINTS_PER_POST : 0 }, 201);
}
