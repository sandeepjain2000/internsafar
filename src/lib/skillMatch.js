/**
 * Shared skill-overlap match % (same rule as candidate browse internships).
 * If posting has no eligibility skills → 100 (nothing to mismatch).
 *
 * Matching uses light normalization + an explicit alias map only.
 * No unrestricted fuzzy / substring matching (Python ≠ PyTorch, C ≠ C++, etc.).
 */

/** Explicit equivalents → one canonical token (lowercase, no spaces). Easy to extend. */
export const SKILL_ALIASES = {
  react: 'react',
  'react.js': 'react',
  'reactjs': 'react',
  'react js': 'react',

  node: 'nodejs',
  'node.js': 'nodejs',
  nodejs: 'nodejs',
  'node js': 'nodejs',

  javascript: 'javascript',
  js: 'javascript',
  'ecmascript': 'javascript',

  typescript: 'typescript',
  ts: 'typescript',

  python: 'python',
  python3: 'python',
  py: 'python',

  'c++': 'cplusplus',
  cpp: 'cplusplus',
  'c plus plus': 'cplusplus',

  'c#': 'csharp',
  csharp: 'csharp',
  'c sharp': 'csharp',

  // Keep C distinct from C++ / C#
  c: 'c',

  nextjs: 'nextjs',
  'next.js': 'nextjs',
  'next js': 'nextjs',

  vue: 'vue',
  'vue.js': 'vue',
  vuejs: 'vue',

  angular: 'angular',
  'angular.js': 'angularjs',
  angularjs: 'angularjs',

  postgresql: 'postgresql',
  postgres: 'postgresql',
  'postgres sql': 'postgresql',

  mongodb: 'mongodb',
  mongo: 'mongodb',

  html: 'html',
  html5: 'html',
  css: 'css',
  css3: 'css',

  'machine learning': 'machinelearning',
  ml: 'machinelearning',
  'deep learning': 'deeplearning',
  'pytorch': 'pytorch',
  'tensor flow': 'tensorflow',
  tensorflow: 'tensorflow',
};

/**
 * Normalize a skill label for matching:
 * - trim, collapse whitespace, lowercase
 * - unify common punctuation variants (.js ↔ js spacing) carefully
 * - do NOT strip meaningful tech punctuation (C++, C#, .NET-style dots kept for alias lookup)
 */
export function normalizeSkillKey(raw) {
  let s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!s) return '';
  // Strip surrounding brackets/quotes only
  s = s.replace(/^["'`(\[]+|["'`)\\\]]+$/g, '').trim();
  // Collapse "react . js" / "react.js" style for alias table keys
  s = s.replace(/\s*\.\s*/g, '.');
  s = s.replace(/\s*#\s*/g, '#');
  s = s.replace(/\s*\+\s*/g, '+');
  return s;
}

/** Resolve to canonical id via aliases; unknown skills keep their normalized key. */
export function canonicalSkill(raw) {
  const key = normalizeSkillKey(raw);
  if (!key) return '';
  if (SKILL_ALIASES[key]) return SKILL_ALIASES[key];
  // Also try without internal spaces for keys like "react js" already covered;
  // compact form for "Node JS" → "nodejs" style lookups
  const compact = key.replace(/\s+/g, '');
  if (SKILL_ALIASES[compact]) return SKILL_ALIASES[compact];
  return key;
}

/** Unique canonical skills, stable first-seen order of original labels. */
export function dedupeCanonicalSkills(skills) {
  const seen = new Set();
  const out = [];
  for (const skill of skills || []) {
    const canon = canonicalSkill(skill);
    if (!canon || seen.has(canon)) continue;
    seen.add(canon);
    out.push({ original: String(skill || '').trim() || canon, canonical: canon });
  }
  return out;
}

export function skillMatchPercent(candidateSkills, eligibility) {
  return skillMatchDetail(candidateSkills, eligibility).percent;
}

export function skillMatchDetail(candidateSkills, eligibility) {
  const requiredRaw = Array.isArray(eligibility?.skills)
    ? eligibility.skills.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  const required = dedupeCanonicalSkills(requiredRaw);
  if (!required.length) {
    return { percent: 100, matched: [], missing: [], requiredCount: 0 };
  }

  const have = new Set(
    dedupeCanonicalSkills(candidateSkills || []).map((s) => s.canonical),
  );

  const matched = [];
  const missing = [];
  for (const skill of required) {
    if (have.has(skill.canonical)) matched.push(skill.original);
    else missing.push(skill.original);
  }
  const percent = Math.round((matched.length / required.length) * 100);
  return { percent, matched, missing, requiredCount: required.length };
}
