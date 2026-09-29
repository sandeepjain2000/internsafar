/** Candidate application labels and next-step copy from live statuses (no stored timeline). */

export function applicationStatusKey(status) {
  return String(status || 'applied').toLowerCase();
}

export function applicationDisplayStatus(status) {
  const s = applicationStatusKey(status);
  if (s === 'applied' || s === 'pending') return 'Awaiting Review';
  if (s === 'shortlisted') return 'Under Review';
  if (s === 'interviewing') return 'Interview Scheduled';
  if (s === 'offered') return 'Offer Received';
  if (s === 'hired') return 'Hired';
  if (s === 'completed') return 'Completed';
  if (s === 'rejected') return 'Rejected';
  if (s === 'withdrawn') return 'Withdrawn';
  if (s === 'declined_offer') return 'Offer Declined';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function applicationStatusTab(status) {
  const s = applicationStatusKey(status);
  if (s === 'applied' || s === 'pending') return 'applied';
  if (s === 'shortlisted') return 'review';
  if (s === 'interviewing') return 'interview';
  if (s === 'offered' || s === 'hired' || s === 'completed') return 'offer';
  if (s === 'rejected' || s === 'declined_offer') return 'rejected';
  if (s === 'withdrawn') return 'withdrawn';
  return 'applied';
}

export function applicationNextStep(row) {
  const s = applicationStatusKey(row?.status);
  if (s === 'interviewing') {
    if (row?.interview_at) {
      const when = new Date(row.interview_at);
      if (!Number.isNaN(when.getTime())) {
        return `Attend interview ${when.toLocaleString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}`;
      }
    }
    return 'Attend the scheduled interview';
  }
  if (s === 'shortlisted') return 'Waiting for employer response on initial screening';
  if (s === 'applied' || s === 'pending') return 'Waiting for employer to review your application';
  if (s === 'offered') return 'Review formal offer letter extended by recruiter';
  if (s === 'hired') return 'Offer accepted — onboarding with the employer';
  if (s === 'completed') return 'Internship completed';
  if (s === 'rejected') return 'This application was not taken forward';
  if (s === 'withdrawn') return 'You withdrew this application';
  if (s === 'declined_offer') return 'You declined this offer';
  return 'Check this application for the latest update';
}

/** Canonical Next-step filter options (process stages). */
export const APPLICATION_NEXT_STEP_OPTIONS = [
  { value: '', label: 'Any next step' },
  { value: 'applied', label: 'Waiting for employer to review your application' },
  { value: 'shortlisted', label: 'Waiting for employer response on initial screening' },
  { value: 'interviewing', label: 'Attend the scheduled interview' },
  { value: 'offered', label: 'Review formal offer letter extended by recruiter' },
  { value: 'hired', label: 'Offer accepted — onboarding with the employer' },
  { value: 'completed', label: 'Internship completed' },
  { value: 'rejected', label: 'This application was not taken forward' },
  { value: 'withdrawn', label: 'You withdrew this application' },
  { value: 'declined_offer', label: 'You declined this offer' },
];

export function applicationNextStepFilterMatch(row, filterValue) {
  const want = String(filterValue || '').trim().toLowerCase();
  if (!want) return true;
  const s = applicationStatusKey(row?.status);
  if (want === 'applied') return s === 'applied' || s === 'pending';
  if (want === 'interviewing') return s === 'interviewing';
  return s === want;
}

export function applicationClosedAt(row) {
  const s = applicationStatusKey(row?.status);
  if (!['rejected', 'withdrawn', 'declined_offer', 'completed', 'hired'].includes(s)) {
    return null;
  }
  const raw = row?.updated_at || row?.closed_at || null;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function applicationClosedLabel(row) {
  const s = applicationStatusKey(row?.status);
  // Excel competitor example: "Not selected on 18 Sep" for rejected applications
  if (s === 'rejected') return 'Not selected on';
  if (s === 'withdrawn') return 'Withdrawn on';
  if (s === 'declined_offer') return 'Offer declined on';
  if (s === 'completed') return 'Completed on';
  if (s === 'hired') return 'Hired on';
  return 'Closed on';
}

/**
 * In-progress = still waiting on the employer. Must match the sidebar badge SQL in
 * `api/ip/nav-badges`: Awaiting Review stops counting once the posting is closed or past its last date.
 */
export function isApplicationInProgress(row) {
  const s = String(row?.status || '').toLowerCase();
  if (s === 'shortlisted' || s === 'interviewing') return true;
  if (s !== 'applied' && s !== 'pending') return false;
  if (String(row?.internship_status || '').toLowerCase() === 'closed') return false;
  if (row?.apply_ends_at) {
    const end = new Date(row.apply_ends_at).getTime();
    if (!Number.isNaN(end) && end <= Date.now()) return false;
  }
  return true;
}

export const APPLICATION_STATUS_GUIDE = [
  { status: 'applied', label: 'Awaiting Review', desc: 'Sent to the employer. They have not opened or screened it yet.' },
  { status: 'shortlisted', label: 'Under Review', desc: 'The employer shortlisted you and is screening your application.' },
  { status: 'interviewing', label: 'Interview Scheduled', desc: 'An interview is booked. Check Messages for the time and link.' },
  { status: 'offered', label: 'Offer Received', desc: 'The employer sent an offer. Accept or decline it on the Offers page.' },
  { status: 'hired', label: 'Hired', desc: 'You accepted the offer and are onboarding with the employer.' },
  { status: 'completed', label: 'Completed', desc: 'The internship has finished.' },
  { status: 'rejected', label: 'Rejected', desc: 'The employer did not take this application forward.' },
  { status: 'withdrawn', label: 'Withdrawn', desc: 'You withdrew it. You can re-apply while the posting is open (points are charged again).' },
  { status: 'declined_offer', label: 'Offer Declined', desc: 'You declined the offer from this employer.' },
];

export function decorateCandidateApplication(row) {
  const closedAt = applicationClosedAt(row);
  return {
    ...row,
    in_progress: isApplicationInProgress(row),
    employer_verified: String(row.approval_status || '').toLowerCase() === 'approved',
    display_status: applicationDisplayStatus(row.status),
    status_tab: applicationStatusTab(row.status),
    next_step: applicationNextStep(row),
    closed_at: closedAt,
    closed_label: closedAt ? applicationClosedLabel(row) : null,
  };
}
