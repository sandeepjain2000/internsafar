/**
 * Client-safe internship stipend formatting / parsing (no DB imports).
 * Schema ensure lives in ensureIpInternshipStipendRangeSchema.js (server only).
 */

function money(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`;
}

/**
 * Candidate/employer-facing stipend label for an internship row.
 * @returns {string|null} null when caller should use its own empty/TBD wording
 */
export function formatInternshipStipend(row, { suffix = '/mo', unpaidLabel = null } = {}) {
  if (!row) return unpaidLabel;
  if (String(row.stipend_type || '').toLowerCase() === 'incentive') {
    return 'Incentive-based';
  }
  const min = row.stipend_inr != null && row.stipend_inr !== '' ? Number(row.stipend_inr) : null;
  const max = row.stipend_inr_max != null && row.stipend_inr_max !== '' ? Number(row.stipend_inr_max) : null;
  const minOk = Number.isFinite(min) && min > 0;
  const maxOk = Number.isFinite(max) && max > 0;
  if (minOk && maxOk && max > min) {
    return `${money(min)}–${money(max)}${suffix}`;
  }
  if (minOk) return `${money(min)}${suffix}`;
  if (maxOk) return `${money(max)}${suffix}`;
  return unpaidLabel;
}

/** Parse create/update body into { stipendInr, stipendInrMax } with validation. */
export function parseStipendRangeFields(body = {}) {
  const rawMin = body.stipendInr ?? body.stipend_inr;
  const rawMax = body.stipendInrMax ?? body.stipend_inr_max;
  const min =
    rawMin === '' || rawMin == null || Number.isNaN(Number(rawMin))
      ? null
      : Math.round(Number(rawMin));
  let max =
    rawMax === '' || rawMax == null || Number.isNaN(Number(rawMax))
      ? null
      : Math.round(Number(rawMax));

  if (min != null && min < 0) {
    return { error: 'Stipend minimum cannot be negative' };
  }
  if (max != null && max < 0) {
    return { error: 'Stipend maximum cannot be negative' };
  }
  if (min != null && max != null && max < min) {
    return { error: 'Stipend maximum must be greater than or equal to the minimum' };
  }
  // Same min/max → store as fixed (clear max)
  if (min != null && max != null && max === min) {
    max = null;
  }
  return { stipendInr: min, stipendInrMax: max };
}
