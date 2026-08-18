/**
 * Shared skill-overlap match % (same rule as candidate browse internships).
 * If posting has no eligibility skills → 100 (nothing to mismatch).
 */
export function skillMatchPercent(candidateSkills, eligibility) {
  const skills = eligibility?.skills;
  if (!Array.isArray(skills) || !skills.length) return 100;
  const have = new Set((candidateSkills || []).map((s) => String(s).toLowerCase()));
  const hits = skills.filter((s) => have.has(String(s).toLowerCase())).length;
  return Math.round((hits / skills.length) * 100);
}
