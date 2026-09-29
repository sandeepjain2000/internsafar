/** Listing report reasons shared by the candidate form, API validation, and SuperAdmin review. */
export const LISTING_REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'misleading', label: 'Misleading details' },
  { value: 'outdated', label: 'Incorrect or outdated information' },
  { value: 'scam', label: 'Suspected scam' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'other', label: 'Other' },
];

export const LISTING_REPORT_REASON_VALUES = new Set(LISTING_REPORT_REASONS.map((r) => r.value));

export function listingReportReasonLabel(value) {
  const hit = LISTING_REPORT_REASONS.find((r) => r.value === String(value || '').toLowerCase());
  return hit?.label || '';
}
