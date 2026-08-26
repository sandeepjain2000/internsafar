/**
 * Shared High / Med / Low bands for Match % and Employer Validation.
 * One helper for Browse cards, list cells, and detail — never diverge.
 */

export function scoreBand(score) {
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return null;
  if (n >= 70) return 'High';
  if (n >= 40) return 'Med';
  return 'Low';
}

/** Compact readout: Match → "72+", Validation → "81/100". */
export function formatScoreReadout(score, { mode = 'plus' } = {}) {
  if (score == null || score === '') return '—';
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return '—';
  if (mode === 'of100') return `${n}/100`;
  return `${n}+`;
}

export function bandClass(band) {
  if (band === 'High') return 'is-high';
  if (band === 'Med') return 'is-med';
  if (band === 'Low') return 'is-low';
  return 'is-empty';
}

/**
 * Plain-language Match explanation vs candidate profile skills.
 * @param {{ percent: number, matched: string[], missing: string[], requiredCount: number }} detail
 */
export function explainMatchPlain(detail) {
  if (!detail) return 'Match compares your profile skills to this role’s listed skills.';
  const band = scoreBand(detail.percent);
  const matched = detail.matched || [];
  const missing = detail.missing || [];
  if (!detail.requiredCount) {
    return 'High Match because this role does not list required skills, so your profile is not limited by skill tags.';
  }
  if (band === 'High') {
    if (matched.length) {
      return `High Match because your profile includes ${listJoin(matched.slice(0, 4))}${matched.length > 4 ? ', and more' : ''}, which this role asks for.`;
    }
    return 'High Match based on how your listed skills overlap with this role.';
  }
  if (band === 'Med') {
    const parts = [];
    if (matched.length) parts.push(`you already have ${listJoin(matched.slice(0, 3))}`);
    if (missing.length) parts.push(`you could still add ${listJoin(missing.slice(0, 3))}`);
    return `Medium Match because ${parts.join('; ') || 'only some of the role’s skills appear on your profile'}.`;
  }
  if (missing.length) {
    return `Low Match because your profile is missing skills this role lists, such as ${listJoin(missing.slice(0, 4))}. Add them on your profile if you have them.`;
  }
  return 'Low Match because few of this role’s listed skills appear on your profile yet.';
}

/**
 * Plain-language Validation explanation from breakdown buckets/factors.
 */
export function explainValidationPlain(score, breakdown) {
  const band = scoreBand(score);
  const factors = Array.isArray(breakdown?.factors) ? breakdown.factors : [];
  const ok = factors.filter((f) => f.status === 'ok' || f.status === 'warn').map((f) => f.label);
  const missing = factors.filter((f) => f.status === 'missing' || f.status === 'fail').map((f) => f.label);
  if (band === 'High') {
    return ok.length
      ? `High Validation because the employer shows solid evidence such as ${listJoin(ok.slice(0, 3))}. This is not a hire guarantee.`
      : 'High Validation based on employer evidence on file. This is not a hire guarantee.';
  }
  if (band === 'Med') {
    return missing.length
      ? `Medium Validation because some evidence is present, but ${listJoin(missing.slice(0, 2))} ${missing.length === 1 ? 'is' : 'are'} still incomplete.`
      : 'Medium Validation — some employer evidence is on file, but not a full set.';
  }
  return missing.length
    ? `Low Validation because key employer evidence is still limited (for example ${listJoin(missing.slice(0, 3))}). You can still apply; this score is advisory.`
    : 'Low Validation because limited employer evidence is on file yet. You can still apply; this score is advisory.';
}

function listJoin(items) {
  const list = (items || []).map((s) => String(s)).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}
