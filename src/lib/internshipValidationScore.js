/**
 * Employer validation score (0–100).
 * Separate evidence factors only — never blocks posting.
 * Upload ethics ticks gate document upload UX only; they are NOT scored here.
 *
 * Factors (25 pts each):
 *   1. SuperAdmin-approved documents
 *   2. Work email domain signal
 *   3. Website domain signal
 *   4. Hiring-manager LinkedIn URL (one profile URL)
 */

function band(score) {
  if (score >= 90) return 'Highly Validated';
  if (score >= 75) return 'Well Validated';
  if (score >= 60) return 'Moderately Validated';
  if (score >= 40) return 'Partially Validated';
  return 'Limited Validation';
}

function hostFromUrlOrEmail(value, { email = false } = {}) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (email) {
    const at = raw.lastIndexOf('@');
    if (at < 0) return '';
    return raw.slice(at + 1).replace(/^www\./, '');
  }
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProto).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isLinkedInProfileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return false;
    return /\/in\//i.test(u.pathname) || /\/company\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * @param {object} input
 * @param {object} input.employer
 * @param {Array}  input.documents
 * @param {object} input.internship — kept for callers; not used to block posting
 */
export function computeValidationScore({ employer = {}, documents = [], internship = {} } = {}) {
  const factors = [];
  const approval = String(employer.approval_status || 'pending').toLowerCase();
  const postingStatus = String(internship.status || '').toLowerCase();
  const docs = Array.isArray(documents) ? documents : [];
  const approvedDocs = docs.filter((d) => String(d.review_status).toLowerCase() === 'approved');

  // Hard outcomes only for rejected/suspended employer or taken-down posting display
  if (approval === 'rejected' || approval === 'suspended') {
    return finalize(0, [
      {
        category: 'A',
        key: 'hard_cap',
        label: 'Employer rejected or suspended',
        points: 0,
        max: 0,
        status: 'fail',
        detail: `approval_status=${approval}`,
      },
    ], approval, postingStatus);
  }
  if (postingStatus === 'closed') {
    return finalize(0, [
      {
        category: 'A',
        key: 'hard_cap',
        label: 'Internship posting taken down / closed',
        points: 0,
        max: 0,
        status: 'fail',
        detail: `status=${postingStatus}`,
      },
    ], approval, postingStatus);
  }

  const docsPts = approvedDocs.length > 0 ? 25 : 0;
  factors.push({
    category: 'A',
    key: 'approved_docs',
    label: 'Approved documents',
    points: docsPts,
    max: 25,
    status: docsPts ? 'ok' : 'missing',
    detail: docsPts
      ? `${approvedDocs.length} SuperAdmin-approved document(s)`
      : 'No SuperAdmin-approved employer documents yet',
  });

  const emailHost = hostFromUrlOrEmail(employer.work_email, { email: true });
  const emailPts = emailHost && !/(gmail|yahoo|outlook|hotmail|icloud)\./i.test(emailHost) ? 25 : 0;
  factors.push({
    category: 'B',
    key: 'email_domain',
    label: 'Work email domain',
    points: emailPts,
    max: 25,
    status: emailPts ? 'ok' : 'missing',
    detail: emailPts
      ? `Corporate-looking domain on file: ${emailHost}`
      : emailHost
        ? `Consumer email domain (${emailHost}) does not count`
        : 'No work email on employer profile',
  });

  const siteHost = hostFromUrlOrEmail(employer.website);
  const sitePts = siteHost ? 25 : 0;
  factors.push({
    category: 'C',
    key: 'website_domain',
    label: 'Website domain',
    points: sitePts,
    max: 25,
    status: sitePts ? 'ok' : 'missing',
    detail: sitePts
      ? `Website domain on profile: ${siteHost}`
      : 'No company website URL on employer profile',
  });

  const liOk = isLinkedInProfileUrl(employer.linkedin_url || employer.hiring_manager_linkedin);
  const liPts = liOk ? 25 : 0;
  factors.push({
    category: 'D',
    key: 'hiring_manager_linkedin',
    label: 'Hiring-manager LinkedIn',
    points: liPts,
    max: 25,
    status: liPts ? 'ok' : 'missing',
    detail: liPts
      ? 'LinkedIn profile/company URL on employer profile'
      : 'Add one hiring-manager LinkedIn URL on the employer profile',
  });

  const total = factors.reduce((sum, f) => sum + (Number(f.points) || 0), 0);
  return finalize(total, factors, approval, postingStatus, {
    a: docsPts,
    b: emailPts,
    c: sitePts,
    d: liPts,
    raw: total,
    cap: 100,
    capReason: null,
  });
}

function finalize(total, factors, approval, postingStatus, buckets = {}) {
  return {
    validation_score: total,
    validation_label: 'Employer validation',
    validation_band: band(total),
    validation_max: 100,
    validation_breakdown: {
      buckets: {
        A: { label: 'Approved documents', score: buckets.a ?? 0, max: 25 },
        B: { label: 'Work email domain', score: buckets.b ?? 0, max: 25 },
        C: { label: 'Website domain', score: buckets.c ?? 0, max: 25 },
        D: { label: 'Hiring-manager LinkedIn', score: buckets.d ?? 0, max: 25 },
      },
      factors,
      raw: buckets.raw ?? total,
      hard_cap: buckets.cap ?? 100,
      cap_reason: buckets.capReason || null,
      employer_approval: approval,
      posting_status: postingStatus,
      disclaimer:
        'Employer validation is an evidence signal from approved documents, email/website domains, and hiring-manager LinkedIn. Ethics upload ticks are not scored. It never blocks posting and is not Match %.',
    },
  };
}

export function validationBand(score) {
  return band(Number(score) || 0);
}
