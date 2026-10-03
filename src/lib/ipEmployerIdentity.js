export const CONFIDENTIAL_EMPLOYER_LABEL = 'Confidential employer';

export function isEmployerIdentityHidden(showIdentity) {
  return showIdentity === false || showIdentity === 'false';
}

export function maskEmployerName(companyName, showIdentity) {
  if (isEmployerIdentityHidden(showIdentity)) {
    return CONFIDENTIAL_EMPLOYER_LABEL;
  }
  return companyName || CONFIDENTIAL_EMPLOYER_LABEL;
}

/** Company string for candidate-facing notifications / emails (null when there is no name to show). */
export function candidateFacingCompany(companyName, showIdentity) {
  if (isEmployerIdentityHidden(showIdentity)) return CONFIDENTIAL_EMPLOYER_LABEL;
  return companyName || null;
}

/** Fields that identify the employer behind a posting; nulled for candidates when the posting is confidential. */
const EMPLOYER_IDENTITY_FIELDS = [
  'employer_id',
  'employer_row_id',
  'employer_name',
  'employer_logo_url',
  'logo_url',
  'website',
  'linkedin_url',
  'about',
  'legal_name',
  'brand_name',
  'historical_hires',
  'contact_name',
  'contact_designation',
  'contact_phone',
  'work_email',
];

/**
 * Candidate view of a row joined to a posting: masks the company name and nulls every
 * identity field when the posting hides the employer.
 */
export function maskEmployerIdentityForCandidate(row, {
  companyKey = 'company_name',
  flagKey = 'show_employer_identity',
} = {}) {
  if (!row || typeof row !== 'object') return row;
  const hidden = isEmployerIdentityHidden(row[flagKey]);
  const out = { ...row, [companyKey]: maskEmployerName(row[companyKey], !hidden) };
  if (!hidden) return out;
  for (const key of EMPLOYER_IDENTITY_FIELDS) {
    if (key in out) out[key] = null;
  }
  if (out.employer && typeof out.employer === 'object') {
    out.employer = maskEmployerIdentityForCandidate({ ...out.employer, [flagKey]: false }, { companyKey, flagKey });
    delete out.employer[flagKey];
  }
  return out;
}

export function applyEmployerIdentityMask(row, {
  companyKey = 'company_name',
  flagKey = 'show_employer_identity',
} = {}) {
  if (!row || typeof row !== 'object') return row;
  const show = row[flagKey];
  return {
    ...row,
    [companyKey]: maskEmployerName(row[companyKey], show !== false),
  };
}
