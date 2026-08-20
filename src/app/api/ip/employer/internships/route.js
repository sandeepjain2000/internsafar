import { query } from '@/lib/db';
import { requireSession, jsonError, jsonOk } from '@/lib/apiAuth';
import { newId } from '@/lib/ids';
import { chargePublishPoints } from '@/lib/chargePublishPoints';
import { POINTS_PER_POST } from '@/lib/pointsEconomy';
import { ensureIpWorkbenchSchema } from '@/lib/ensureIpWorkbenchSchema';
import { validateScreeningQuestions } from '@/lib/ipScreeningQuestions';
import { validateScheduleFields, deriveLifecycleLabel } from '@/lib/ipInternshipVisibility';
import { MAX_ACTIVE_APPLICATIONS_PER_POSTING } from '@/lib/ipApplicationCapacity';

export async function GET() {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();
  const emp = await query(`SELECT id FROM ip_employers WHERE user_id = $1`, [session.user.id]);
  if (!emp.rows[0]) return jsonOk({ items: [] });
  const result = await query(
    `SELECT i.*,
       (SELECT count(*)::int FROM ip_applications a WHERE a.internship_id = i.id) as applicant_count,
       (SELECT count(*)::int FROM ip_applications a
         WHERE a.internship_id = i.id AND a.status NOT IN ('rejected', 'withdrawn')) as active_applicant_count
     FROM ip_internships i WHERE i.employer_id = $1 ORDER BY i.created_at DESC`,
    [emp.rows[0].id],
  );
  return jsonOk({
    items: result.rows.map((row) => ({
      ...row,
      lifecycle_label: deriveLifecycleLabel(row),
      application_cap: MAX_ACTIVE_APPLICATIONS_PER_POSTING,
      capacity_label: `${row.active_applicant_count || 0}/${MAX_ACTIVE_APPLICATIONS_PER_POSTING} active`,
    })),
  });
}

export async function POST(request) {
  const { session, error } = await requireSession(['employer']);
  if (error) return error;
  await ensureIpWorkbenchSchema();

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
    body = await bodyJson(request);
  } catch {
    return jsonError('Invalid JSON');
  }
  const title = String(body.title || '').trim();
  if (!title) return jsonError('Title is required');

  const { errors: qErrors, questions } = validateScreeningQuestions(body.questions || []);
  if (qErrors.length) return jsonError(qErrors[0], 400);

  const startsAtRaw = body.startsAt || body.starts_at || null;
  const applyEndsRaw = body.applyEndsAt || body.apply_ends_at || null;
  const schedule = validateScheduleFields({
    startsAt: startsAtRaw,
    applyEndsAt: applyEndsRaw,
    isNewSchedule: Boolean(startsAtRaw) && body.status !== 'draft',
  });
  if (schedule.errors.length) return jsonError(schedule.errors[0], 400);

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
  const locations = normalizeLocations(body.locations, body.location);

  // Duplicate warning data (non-blocking)
  const dupes = await query(
    `SELECT id, title, status FROM ip_internships
     WHERE employer_id = $1 AND lower(title) = lower($2) AND status IN ('published', 'paused', 'draft')
     LIMIT 5`,
    [emp.rows[0].id, title],
  );

  const remindBeforeStart = Boolean(body.remindBeforeStart ?? body.remind_before_start);
  const remindBeforeEnd = Boolean(body.remindBeforeEnd ?? body.remind_before_end);
  const remindStartHours = Math.max(1, Number(body.remindStartHours ?? body.remind_start_hours ?? 24) || 24);
  const remindEndHours = Math.max(1, Number(body.remindEndHours ?? body.remind_end_hours ?? 24) || 24);

  const id = newId('ip_int');
  await query(
    `INSERT INTO ip_internships (
       id, employer_id, title, description, location, work_mode, stipend_inr, duration_months,
       start_date, end_date, eligibility, questions, status, show_employer_identity,
       work_hours_start, work_hours_end, engagement_type, weekly_hours, stipend_type, incentive_basis,
       starts_at, apply_ends_at, locations,
       remind_before_start, remind_before_end, remind_start_hours, remind_end_hours
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26,$27)`,
    [
      id, emp.rows[0].id, title, body.description || '', body.location || locations[0] || '', body.workMode || 'Remote',
      body.stipendInr || null, body.durationMonths || null, body.startDate || null, body.endDate || null,
      JSON.stringify(body.eligibility || {}), JSON.stringify(questions),
      publishing ? 'published' : 'draft',
      body.showEmployerIdentity !== false,
      body.workHoursStart || body.work_hours_start || null,
      body.workHoursEnd || body.work_hours_end || null,
      engagementType || null,
      engagementType === 'part_time' && weeklyHours !== '' && weeklyHours != null ? Number(weeklyHours) : null,
      stipendType || null,
      stipendType === 'incentive' ? (incentiveBasis || null) : null,
      startsAtRaw || null,
      applyEndsRaw || null,
      JSON.stringify(locations),
      remindBeforeStart,
      remindBeforeEnd,
      remindStartHours,
      remindEndHours,
    ],
  );

  return jsonOk({
    ok: true,
    id,
    pointsCharged: publishing ? POINTS_PER_POST : 0,
    duplicateWarning: dupes.rows.length
      ? { message: 'Similar open posting(s) found', items: dupes.rows }
      : null,
  }, 201);
}

function normalizeLocations(locations, location) {
  const out = [];
  if (Array.isArray(locations)) {
    for (const c of locations) {
      const s = String(c || '').trim();
      if (s && !out.includes(s)) out.push(s);
    }
  }
  const single = String(location || '').trim();
  if (single && !out.includes(single)) out.unshift(single);
  return out;
}

async function bodyJson(request) {
  return request.json();
}
