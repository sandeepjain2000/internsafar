/**
 * Posting visibility / lifecycle for candidate surfaces and apply enforcement.
 * Legacy rows: null starts_at/apply_ends_at → treat as immediately live when published.
 */

export function deriveLifecycleLabel(internship, now = new Date()) {
  const status = String(internship?.status || '').toLowerCase();
  if (status === 'draft') return 'Draft';
  if (status === 'paused') return 'Paused';
  if (status === 'closed') {
    if (internship?.closed_reason === 'expired' || internship?.closed_reason === 'archived') {
      return internship.closed_reason === 'archived' ? 'Archived' : 'Expired';
    }
    return 'Closed';
  }
  if (status !== 'published') return status || 'Unknown';

  const startsAt = internship?.starts_at ? new Date(internship.starts_at) : null;
  const endsAt = internship?.apply_ends_at ? new Date(internship.apply_ends_at) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) {
    return 'Scheduled';
  }
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= now.getTime()) {
    return 'Expired';
  }
  // Closing soon: live and ends within 48 hours
  if (endsAt && !Number.isNaN(endsAt.getTime())) {
    const msLeft = endsAt.getTime() - now.getTime();
    if (msLeft > 0 && msLeft <= 48 * 60 * 60 * 1000) return 'Closing soon';
  }
  return 'Live';
}

/** Hours until apply window closes; null if no end or already closed. */
export function hoursUntilClose(internship, now = new Date()) {
  const endsAt = internship?.apply_ends_at ? new Date(internship.apply_ends_at) : null;
  if (!endsAt || Number.isNaN(endsAt.getTime())) return null;
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}

/**
 * Candidate may see / open / apply when published, not paused/closed/draft,
 * and within [starts_at, apply_ends_at) when those are set.
 */
export function isCandidateAccessible(internship, now = new Date()) {
  if (!internship) return false;
  const status = String(internship.status || '').toLowerCase();
  if (status !== 'published') return false;

  const startsAt = internship.starts_at ? new Date(internship.starts_at) : null;
  const endsAt = internship.apply_ends_at ? new Date(internship.apply_ends_at) : null;
  const t = now.getTime();

  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > t) return false;
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= t) return false;
  return true;
}

/** SQL fragment: internship alias `i` is candidate-visible right now. */
export const CANDIDATE_VISIBLE_SQL = `
  i.status = 'published'
  AND (i.starts_at IS NULL OR i.starts_at <= now())
  AND (i.apply_ends_at IS NULL OR i.apply_ends_at > now())
`;

export function validateScheduleFields({ startsAt, applyEndsAt, isNewSchedule = false, now = new Date() }) {
  const errors = [];
  let start = startsAt ? new Date(startsAt) : null;
  let end = applyEndsAt ? new Date(applyEndsAt) : null;
  if (startsAt && Number.isNaN(start?.getTime())) {
    errors.push('Invalid posting start date/time');
    start = null;
  }
  if (applyEndsAt && Number.isNaN(end?.getTime())) {
    errors.push('Invalid application end date/time');
    end = null;
  }
  if (isNewSchedule && start && start.getTime() <= now.getTime()) {
    errors.push('Scheduled start must be in the future');
  }
  if (start && end && end.getTime() <= start.getTime()) {
    errors.push('Application end must be after posting start');
  }
  if (!start && end && end.getTime() <= now.getTime() && isNewSchedule) {
    errors.push('Application end must be in the future when no start is set');
  }
  return { errors, startsAt: start, applyEndsAt: end };
}
