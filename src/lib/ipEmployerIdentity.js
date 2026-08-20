export const CONFIDENTIAL_EMPLOYER_LABEL = 'Confidential employer';

export function maskEmployerName(companyName, showIdentity) {
  if (showIdentity === false || showIdentity === 'false') {
    return CONFIDENTIAL_EMPLOYER_LABEL;
  }
  return companyName || CONFIDENTIAL_EMPLOYER_LABEL;
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
