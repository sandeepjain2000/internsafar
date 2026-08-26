/**
 * Structured posting body: About / Minimum Requirements / Ideal Candidate.
 * Additive — legacy plain `description` still works as About.
 */

export function normalizeBulletText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((line) => String(line || '').replace(/^[-•*]\s*/, '').trim()).filter(Boolean).join('\n');
  }
  return String(value);
}

/** Lines suitable for <ul> rendering; empty if not list-like. */
export function bulletLines(value) {
  const raw = normalizeBulletText(value).trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  if (lines.length >= 2) return lines;
  if (lines.length === 1 && /[;|]/.test(lines[0]) && lines[0].length > 40) {
    return lines[0].split(/[;|]/).map((s) => s.trim()).filter(Boolean);
  }
  return lines.length === 1 ? lines : [];
}

export function postingSectionsFromRow(internship) {
  const eligibility = internship?.eligibility && typeof internship.eligibility === 'object'
    ? internship.eligibility
    : {};
  const about = normalizeBulletText(internship?.description || '');
  const requirements = normalizeBulletText(
    eligibility.requirements_text
      ?? eligibility.minimum_requirements
      ?? '',
  );
  const ideal = normalizeBulletText(
    eligibility.ideal_profile_text
      ?? eligibility.ideal_candidate
      ?? '',
  );
  return { about, requirements, ideal, skills: Array.isArray(eligibility.skills) ? eligibility.skills : [] };
}

export function mergeEligibilitySections(eligibility, { requirements, ideal }) {
  const base = eligibility && typeof eligibility === 'object' ? { ...eligibility } : {};
  if (requirements != null) base.requirements_text = normalizeBulletText(requirements);
  if (ideal != null) base.ideal_profile_text = normalizeBulletText(ideal);
  return base;
}

/** Parse experience JSON stored in prior_experience (or legacy free text). */
export function parseExperienceEntries(raw) {
  if (Array.isArray(raw)) return raw.map(normalizeExp).filter(Boolean);
  const text = String(raw || '').trim();
  if (!text) return [emptyExperience()];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeExp).filter(Boolean);
    } catch {
      /* fall through */
    }
  }
  return [{ ...emptyExperience(), description: text }];
}

export function serializeExperienceEntries(entries) {
  const list = (entries || []).map(normalizeExp).filter((e) => e && (e.title || e.organization || e.description));
  if (!list.length) return '';
  return JSON.stringify(list);
}

export function emptyExperience() {
  return {
    id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    organization: '',
    start: '',
    end: '',
    description: '',
  };
}

function normalizeExp(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id || emptyExperience().id,
    title: String(row.title || ''),
    organization: String(row.organization || ''),
    start: String(row.start || ''),
    end: String(row.end || ''),
    description: String(row.description || ''),
  };
}
