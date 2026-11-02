import { skillMatchPercent } from './skillMatch.js';

/**
 * Live match % from current candidate skills + internship eligibility.
 * Does not read ip_applications.match_score.
 */
export function liveMatchScore(candidateSkills, eligibility) {
  return skillMatchPercent(candidateSkills || [], eligibility || {});
}

/**
 * Overwrite `match_score` on each row using that row's skills + shared eligibility.
 * Mutates and returns the same array.
 */
export function attachLiveMatchScores(rows, eligibility, skillsKey = 'skills') {
  const elig = eligibility || {};
  for (const row of rows || []) {
    row.match_score = liveMatchScore(row[skillsKey], elig);
  }
  return rows;
}

/**
 * When each row may belong to a different internship (eligibility per row).
 * `eligibilityOf(row)` must return the eligibility object (or { skills }).
 */
export function attachLiveMatchScoresPerRow(rows, eligibilityOf, skillsKey = 'skills') {
  for (const row of rows || []) {
    const elig = typeof eligibilityOf === 'function' ? eligibilityOf(row) : null;
    row.match_score = liveMatchScore(row[skillsKey], elig || {});
  }
  return rows;
}

/** Filter / sort helpers used after live scores are attached. */
export function filterByMinMatch(rows, minMatch) {
  const floor = Number(minMatch) || 0;
  if (!floor) return rows || [];
  return (rows || []).filter((r) => Number(r.match_score ?? 0) >= floor);
}

export function sortByMatchDesc(rows, tieBreak) {
  const list = [...(rows || [])];
  list.sort((a, b) => {
    const d = (b.match_score ?? -1) - (a.match_score ?? -1);
    if (d !== 0) return d;
    return typeof tieBreak === 'function' ? tieBreak(a, b) : 0;
  });
  return list;
}

export function paginateRows(rows, page, pageSize) {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.max(1, Number(pageSize) || 20);
  const offset = (p - 1) * size;
  return {
    total: (rows || []).length,
    page: p,
    pageSize: size,
    items: (rows || []).slice(offset, offset + size),
  };
}
