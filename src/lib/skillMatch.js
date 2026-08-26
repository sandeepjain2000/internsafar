/**
 * Shared skill-overlap match % (same rule as candidate browse internships).
 * If posting has no eligibility skills → 100 (nothing to mismatch).
 */

export function skillMatchPercent(candidateSkills, eligibility) {
  return skillMatchDetail(candidateSkills, eligibility).percent;
}

export function skillMatchDetail(candidateSkills, eligibility) {
  const required = Array.isArray(eligibility?.skills)
    ? eligibility.skills.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  if (!required.length) {
    return { percent: 100, matched: [], missing: [], requiredCount: 0 };
  }
  const have = new Set((candidateSkills || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean));
  const matched = [];
  const missing = [];
  for (const skill of required) {
    if (have.has(skill.toLowerCase())) matched.push(skill);
    else missing.push(skill);
  }
  const percent = Math.round((matched.length / required.length) * 100);
  return { percent, matched, missing, requiredCount: required.length };
}
