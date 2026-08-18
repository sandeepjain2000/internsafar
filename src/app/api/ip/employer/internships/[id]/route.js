import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { chargePublishPoints } from '@/lib/chargePublishPoints';

const EDITABLE_FIELDS = [
  'title', 'description', 'location', 'work_mode', 'stipend_inr', 'duration_months', 'start_date',
  'end_date', 'status', 'show_employer_identity',
  'work_hours_start', 'work_hours_end', 'engagement_type', 'weekly_hours', 'stipend_type', 'incentive_basis',
];

async function loadOwned(id, employerId) {
  const result = await query(`SELECT * FROM ip_internships WHERE id = $1 AND employer_id = $2`, [id, employerId]);
  return result.rows[0] || null;
}

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const row = await loadOwned(id, emp.rows[0]?.id);
  if (!row) return jsonError('Not found', 404);
  return jsonOk({ internship: row });
}

export async function PUT(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const existing = await loadOwned(id, emp.rows[0]?.id);
  if (!existing) return jsonError('Not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON');
  }
  const camelToSnake = {
    workMode: 'work_mode', stipendInr: 'stipend_inr', durationMonths: 'duration_months',
    startDate: 'start_date', endDate: 'end_date', showEmployerIdentity: 'show_employer_identity',
    workHoursStart: 'work_hours_start', workHoursEnd: 'work_hours_end',
    engagementType: 'engagement_type', weeklyHours: 'weekly_hours',
    stipendType: 'stipend_type', incentiveBasis: 'incentive_basis',
  };
  const normalized = {};
  for (const [k, v] of Object.entries(body)) {
    normalized[camelToSnake[k] || k] = v;
  }

  const sets = [];
  const values = [id];
  for (const field of EDITABLE_FIELDS) {
    if (normalized[field] === undefined) continue;
    values.push(normalized[field]);
    sets.push(`${field} = $${values.length}`);
  }
  if (normalized.eligibility !== undefined) {
    values.push(JSON.stringify(normalized.eligibility));
    sets.push(`eligibility = $${values.length}::jsonb`);
  }
  if (normalized.questions !== undefined) {
    values.push(JSON.stringify(normalized.questions));
    sets.push(`questions = $${values.length}::jsonb`);
  }
  if (sets.length) {
    // Debit points when moving into published from a non-published state
    if (normalized.status === 'published' && existing.status !== 'published') {
      const spendErr = await chargePublishPoints(session.user.id, {
        action: 'republish',
        internshipId: id,
      });
      if (spendErr) return jsonError(spendErr, 403);
    }
    await query(`UPDATE ip_internships SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, values);
  }
  return jsonOk({ ok: true });
}

export async function DELETE(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const existing = await loadOwned(id, emp.rows[0]?.id);
  if (!existing) return jsonError('Not found', 404);
  await query(`UPDATE ip_internships SET status = 'closed', updated_at = now() WHERE id = $1`, [id]);
  return jsonOk({ ok: true });
}
