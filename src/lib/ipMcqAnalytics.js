/**
 * Summarize MCQ answer distribution for an internship's applications.
 * Uses live answers + questions_snapshot when present.
 */
export function summarizeMcqResponses(questions, applications) {
  const qs = Array.isArray(questions) ? questions : [];
  const apps = Array.isArray(applications) ? applications : [];
  return qs
    .filter((q) => q && (q.type === 'mcq' || Array.isArray(q.options)))
    .map((q) => {
      const options = Array.isArray(q.options) ? q.options : [];
      const counts = Object.fromEntries(options.map((o) => [o.id, 0]));
      let answered = 0;
      let skipped = 0;
      for (const app of apps) {
        const answers = app.answers && typeof app.answers === 'object' ? app.answers : {};
        const raw = answers[q.id];
        const val = raw == null ? '' : String(typeof raw === 'object' ? raw.optionId || raw.value || '' : raw).trim();
        if (!val) {
          skipped += 1;
          continue;
        }
        answered += 1;
        const opt = options.find((o) => o.id === val || o.label === val);
        const key = opt?.id || val;
        counts[key] = (counts[key] || 0) + 1;
      }
      const totalForPct = answered || 1;
      const optionStats = options.map((o) => ({
        id: o.id,
        label: o.label,
        count: counts[o.id] || 0,
        percent: Math.round(((counts[o.id] || 0) / totalForPct) * 100),
        disablesApplication: Boolean(o.disablesApplication),
      }));
      return {
        questionId: q.id,
        prompt: q.prompt,
        answered,
        skipped,
        options: optionStats,
      };
    });
}

export function applicationsToCsv(rows) {
  const headers = [
    'application_id',
    'candidate_name',
    'email',
    'phone',
    'college',
    'degree',
    'specialization',
    'study_status',
    'graduation_year',
    'cgpa',
    'city',
    'state',
    'country',
    'skills',
    'preferred_work_mode',
    'preferred_hours_start',
    'preferred_hours_end',
    'availability_date',
    'prior_experience',
    'immediate_start',
    'willing_to_relocate',
    'ongoing_commitment',
    'linkedin_url',
    'github_url',
    'portfolio_url',
    'has_wired_broadband',
    'has_dedicated_laptop',
    'match_score',
    'status',
    'screening_disabled',
    'resume_included',
    'created_at',
  ];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const yn = (v) => (v == null || v === '' ? '' : v ? 'yes' : 'no');
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.name,
        r.email,
        r.phone || '',
        r.college,
        r.degree,
        r.specialization || '',
        r.study_status || '',
        r.graduation_year || '',
        r.cgpa ?? '',
        r.city,
        r.state || '',
        r.country || '',
        Array.isArray(r.skills) ? r.skills.join('; ') : r.skills || '',
        r.preferred_work_mode || '',
        r.preferred_hours_start || '',
        r.preferred_hours_end || '',
        r.availability_date || '',
        r.prior_experience || '',
        yn(r.immediate_start),
        yn(r.willing_to_relocate),
        r.ongoing_commitment || '',
        r.linkedin_url || '',
        r.github_url || '',
        r.portfolio_url || '',
        yn(r.has_wired_broadband),
        yn(r.has_dedicated_laptop),
        r.match_score,
        r.status,
        r.screening_disabled ? 'yes' : 'no',
        r.resume_url ? 'yes' : 'no',
        r.created_at,
      ]
        .map(escape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
