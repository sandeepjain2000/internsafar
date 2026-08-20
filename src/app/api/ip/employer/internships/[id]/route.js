import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { chargePublishPoints } from '@/lib/chargePublishPoints';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { validateScreeningQuestions } from '@/lib/ipScreeningQuestions';
import { validateScheduleFields, deriveLifecycleLabel } from '@/lib/ipInternshipVisibility';
import { newId } from '@/lib/ids';
import { MAX_ACTIVE_APPLICATIONS_PER_POSTING } from '@/lib/ipApplicationCapacity';

const EDITABLE_FIELDS = [
  'title', 'description', 'location', 'work_mode', 'stipend_inr', 'duration_months', 'start_date',
  'end_date', 'status', 'show_employer_identity',
  'work_hours_start', 'work_hours_end', 'engagement_type', 'weekly_hours', 'stipend_type', 'incentive_basis',
  'starts_at', 'apply_ends_at', 'closed_reason',
  'remind_before_start', 'remind_before_end', 'remind_start_hours', 'remind_end_hours',
];

async function loadOwned(id, employerId) {
  const result = await query(`SELECT * FROM ip_internships WHERE id = $1 AND employer_id = $2`, [id, employerId]);
  return result.rows[0] || null;
}

export async function GET(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const { id } = await params;
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  const row = await loadOwned(id, emp.rows[0]?.id);
  if (!row) return jsonError('Not found', 404);

  const counts = await query(
    `SELECT
       count(*)::int AS historical,
       count(*) FILTER (WHERE status NOT IN ('rejected', 'withdrawn'))::int AS active
     FROM ip_applications WHERE internship_id = $1`,
    [id],
  );

  return jsonOk({
    internship: {
      ...row,
      lifecycle_label: deriveLifecycleLabel(row),
      applicant_count: counts.rows[0]?.historical || 0,
      active_applicant_count: counts.rows[0]?.active || 0,
      application_cap: MAX_ACTIVE_APPLICATIONS_PER_POSTING,
    },
  });
}

export async function PUT(request, { params }) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
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

  // Repost / duplicate: create new posting from this one
  if (body.action === 'duplicate' || body.action === 'repost') {
    const newIdVal = newId('ip_int');
    await query(
      `INSERT INTO ip_internships (
         id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
         start_date, end_date, eligibility, questions, status, show_employer_identity,
         work_hours_start, work_hours_end, engagement_type, weekly_hours, stipend_type, incentive_basis,
         starts_at, apply_ends_at, locations
       )
       SELECT $1, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
         start_date, end_date, eligibility, questions, 'draft', show_employer_identity,
         work_hours_start, work_hours_end, engagement_type, weekly_hours, stipend_type, incentive_basis,
         NULL, NULL, locations
       FROM ip_internships WHERE id = $2`,
      [newIdVal, id],
    );
    return jsonOk({ ok: true, id: newIdVal, duplicatedFrom: id });
  }

  const camelToSnake = {
    workMode: 'work_mode', stipendInr: 'stipend_inr', durationMonths: 'duration_months',
    startDate: 'start_date', endDate: 'end_date', showEmployerIdentity: 'show_employer_identity',
    workHoursStart: 'work_hours_start', workHoursEnd: 'work_hours_end',
    engagementType: 'engagement_type', weeklyHours: 'weekly_hours',
    stipendType: 'stipend_type', incentiveBasis: 'incentive_basis',
    startsAt: 'starts_at', applyEndsAt: 'apply_ends_at', closedReason: 'closed_reason',
    remindBeforeStart: 'remind_before_start', remindBeforeEnd: 'remind_before_end',
    remindStartHours: 'remind_start_hours', remindEndHours: 'remind_end_hours',
  };
  const normalized = {};
  for (const [k, v] of Object.entries(body)) {
    normalized[camelToSnake[k] || k] = v;
  }

  if (normalized.starts_at !== undefined || normalized.apply_ends_at !== undefined) {
    const schedule = validateScheduleFields({
      startsAt: normalized.starts_at !== undefined ? normalized.starts_at : existing.starts_at,
      applyEndsAt: normalized.apply_ends_at !== undefined ? normalized.apply_ends_at : existing.apply_ends_at,
      isNewSchedule: Boolean(normalized.starts_at) && normalized.starts_at !== existing.starts_at,
    });
    if (schedule.errors.length) return jsonError(schedule.errors[0], 400);
  }

  if (normalized.questions !== undefined) {
    const { errors: qErrors, questions } = validateScreeningQuestions(normalized.questions);
    if (qErrors.length) return jsonError(qErrors[0], 400);
    normalized.questions = questions;
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
  if (normalized.locations !== undefined) {
    values.push(JSON.stringify(Array.isArray(normalized.locations) ? normalized.locations : []));
    sets.push(`locations = $${values.length}::jsonb`);
  }
  if (sets.length) {
    if (normalized.status === 'published' && existing.status !== 'published') {
      const spendErr = await chargePublishPoints(session.user.id, {
        action: 'republish',
        internshipId: id,
      });
      if (spendErr) return jsonError(spendErr, 403);
    }
    if (normalized.status === 'closed' && !normalized.closed_reason) {
      values.push('closed');
      sets.push(`closed_reason = $${values.length}`);
    }
    // Auto-mark expired when apply_ends_at in past and still published
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
  await query(
    `UPDATE ip_internships SET status = 'closed', closed_reason = 'closed', updated_at = now() WHERE id = $1`,
    [id],
  );
  return jsonOk({ ok: true });
}
