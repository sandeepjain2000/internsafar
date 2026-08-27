/** Candidate/employer offer labels from live rows. Never invent letter text or Unsplash logos. */

export function offerDeadlineEnd(validUntil) {
  if (!validUntil) return null;
  const d = new Date(validUntil);
  if (Number.isNaN(d.getTime())) return null;
  const end = new Date(d);
  if (String(validUntil).length <= 10) {
    end.setHours(23, 59, 59, 999);
  }
  return end;
}

export function offerIsExpired(row) {
  const s = String(row?.status || '').toLowerCase();
  if (s === 'expired') return true;
  if (s !== 'pending') return false;
  const end = offerDeadlineEnd(row?.valid_until);
  if (!end) return false;
  return end.getTime() < Date.now();
}

export function offerDisplayStatus(row) {
  const s = String(row?.status || '').toLowerCase();
  if (offerIsExpired(row) && (s === 'pending' || s === 'expired')) {
    return { key: 'expired', tab: 'expired', label: 'Expired' };
  }
  if (s === 'pending') return { key: 'action_required', tab: 'action_required', label: 'Action Required' };
  if (s === 'accepted') return { key: 'accepted', tab: 'accepted', label: 'Offer Accepted' };
  if (s === 'declined') return { key: 'declined', tab: 'declined', label: 'Offer Declined' };
  if (s === 'expired') return { key: 'expired', tab: 'expired', label: 'Expired' };
  return { key: s || 'other', tab: s || 'all', label: s || '—' };
}

export function offerDaysRemainingLabel(row) {
  const disp = offerDisplayStatus(row);
  // Days remaining = how long a pending offer is still available to accept.
  // Never show a countdown on declined/accepted/expired — use date labels only.
  if (disp.key === 'declined') {
    if (row?.responded_at) {
      return `Declined on ${new Date(row.responded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return null;
  }
  if (disp.key === 'accepted') {
    if (row?.responded_at) {
      return `Accepted on ${new Date(row.responded_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return null;
  }
  const end = offerDeadlineEnd(row?.valid_until);
  if (!end) return null;
  if (disp.key === 'expired') {
    const days = Math.max(1, Math.ceil((Date.now() - end.getTime()) / (24 * 60 * 60 * 1000)));
    return `Expired ${days} day${days === 1 ? '' : 's'} ago`;
  }
  if (disp.key !== 'action_required') return null;
  const days = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'Expires today';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

export function formatOfferDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatStipendInr(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `₹${n.toLocaleString('en-IN')} / month`;
}

export function formatDurationMonths(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1 ? '1 Month' : `${n} Months`;
}

export function workModeLocation(row) {
  const mode = row?.work_mode || '';
  const loc = row?.location || '';
  if (mode && loc) return `${mode} — ${loc}`;
  return mode || loc || null;
}

function trimOrNull(value) {
  const s = String(value || '').trim();
  return s || null;
}

export function decorateCandidateOffer(row) {
  const disp = offerDisplayStatus(row);
  const endDate = row.end_date || row.offer_end_date || row.internship_end_date || null;
  return {
    ...row,
    display_status: disp.key,
    display_tab: disp.tab,
    display_status_label: disp.label,
    employer_verified: String(row.approval_status || '').toLowerCase() === 'approved',
    days_remaining_label: offerDaysRemainingLabel(row),
    stipend_label: formatStipendInr(row.stipend_inr ?? row.internship_stipend_inr),
    duration_label: formatDurationMonths(row.duration_months),
    work_mode_label: workModeLocation(row),
    start_date_label: formatOfferDate(row.start_date),
    end_date_label: formatOfferDate(endDate),
    expiry_date_label: formatOfferDate(row.valid_until),
    recruiter_name: trimOrNull(row.contact_name) || trimOrNull(row.employer_name) || null,
    recruiter_role: trimOrNull(row.contact_designation),
    hr_email: trimOrNull(row.hr_contact_email) || trimOrNull(row.work_email),
    hr_phone: trimOrNull(row.hr_contact_phone) || trimOrNull(row.contact_phone),
    onboarding_instructions: trimOrNull(row.onboarding_instructions),
    mentor_name: trimOrNull(row.mentor_name),
    letter_url: trimOrNull(row.letter_url),
  };
}
