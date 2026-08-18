/** Candidate application labels and next-step copy from live statuses (no stored timeline). */

export function applicationStatusKey(status) {
  return String(status || 'applied').toLowerCase();
}

export function applicationDisplayStatus(status) {
  const s = applicationStatusKey(status);
  if (s === 'applied' || s === 'pending') return 'Applied';
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

export function decorateCandidateApplication(row) {
  return {
    ...row,
    employer_verified: String(row.approval_status || '').toLowerCase() === 'approved',
    display_status: applicationDisplayStatus(row.status),
    status_tab: applicationStatusTab(row.status),
    next_step: applicationNextStep(row),
  };
}
