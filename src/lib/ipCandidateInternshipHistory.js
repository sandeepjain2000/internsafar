/**
 * Candidate internship history from ip_applications (no ip_participations table).
 * Respect show_completed_internships privacy.
 */

export function summarizeInternshipHistory(applications, { showCompleted = true } = {}) {
  const apps = Array.isArray(applications) ? applications : [];
  const total = apps.length;
  let completed = 0;
  let ongoing = 0;
  for (const a of apps) {
    if (a.completed_at || String(a.status || '').toLowerCase() === 'completed') {
      completed += 1;
    } else if (['hired', 'accepted', 'offered', 'interviewing'].includes(String(a.status || '').toLowerCase())) {
      ongoing += 1;
    }
  }
  return {
    total_internships: total,
    completed_internships: showCompleted ? completed : null,
    ongoing_internships: ongoing,
    completed_hidden: !showCompleted,
  };
}

/** SQL aggregates for employer applicant queries (privacy-aware). */
export function internshipHistorySelectSql(candidateAlias = 'c') {
  return `
    (SELECT count(*)::int FROM ip_applications ha WHERE ha.candidate_id = ${candidateAlias}.id) AS hist_total,
    (SELECT count(*)::int FROM ip_applications ha
      WHERE ha.candidate_id = ${candidateAlias}.id
        AND (ha.completed_at IS NOT NULL OR ha.status = 'completed')) AS hist_completed,
    (SELECT count(*)::int FROM ip_applications ha
      WHERE ha.candidate_id = ${candidateAlias}.id
        AND ha.status IN ('hired', 'accepted', 'offered', 'interviewing')
        AND ha.completed_at IS NULL) AS hist_ongoing,
    ${candidateAlias}.show_completed_internships
  `;
}

export function decorateHistoryFields(row) {
  const show = row.show_completed_internships !== false;
  return {
    internship_history: {
      total_internships: Number(row.hist_total || 0),
      completed_internships: show ? Number(row.hist_completed || 0) : null,
      ongoing_internships: Number(row.hist_ongoing || 0),
      completed_hidden: !show,
    },
  };
}
