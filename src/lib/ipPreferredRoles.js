/**
 * Preferred roles / interests — free-text on profile, TEXT[] in DB.
 * Soft-match tokens for Recommended (ILIKE-style contains, not strict equality).
 */

/** Display value for textarea (array → comma-space joined). */
export function preferredRolesToText(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s || '').trim()).filter(Boolean).join(', ');
  }
  return String(value || '').trim();
}

/**
 * Persist free text as TEXT[]:
 * - Split on commas / newlines / semicolons / pipes when present
 * - Otherwise keep the whole remark as one element
 */
export function normalizePreferredRolesInput(value) {
  const text = preferredRolesToText(value);
  if (!text) return [];
  if (/[,;\n|/]/.test(text)) {
    return text
      .split(/[,;\n|/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  return [text.slice(0, 500)];
}

/** Tokens used for soft matching internship title / skills / industry. */
export function preferredRolesMatchTokens(value) {
  const parts = Array.isArray(value)
    ? value.map((s) => String(s || '').trim()).filter(Boolean)
    : normalizePreferredRolesInput(value);
  const tokens = new Set();
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.length >= 2) tokens.add(lower);
    // Also pull meaningful words from a prose remark
    for (const word of lower.split(/[^a-z0-9+#./-]+/i)) {
      const w = word.trim();
      if (w.length >= 3 && !STOP.has(w)) tokens.add(w);
    }
  }
  return [...tokens];
}

const STOP = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'that', 'this', 'have', 'want',
  'like', 'interested', 'interest', 'interests', 'looking', 'role', 'roles',
  'internship', 'intern', 'work', 'field', 'area', 'areas', 'about', 'would',
]);

/**
 * Soft match: token contained in title / description / industry / eligibility skills.
 */
export function internshipMatchesPreferredRoles(internship, tokens) {
  if (!tokens?.length) return false;
  let eligibility = internship?.eligibility;
  if (typeof eligibility === 'string') {
    try {
      eligibility = JSON.parse(eligibility);
    } catch {
      eligibility = null;
    }
  }
  const skills = Array.isArray(eligibility?.skills)
    ? eligibility.skills
    : Array.isArray(internship?.skill_tags)
      ? internship.skill_tags
      : [];
  const hay = [
    internship?.title,
    internship?.description,
    internship?.employer_industry,
    internship?.industry,
    ...skills,
  ]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  if (!hay.trim()) return false;
  return tokens.some((t) => t && hay.includes(t));
}
