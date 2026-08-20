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
    'college',
    'degree',
    'city',
    'match_score',
    'status',
    'screening_disabled',
    'skills',
    'created_at',
  ];
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.name,
        r.email,
        r.college,
        r.degree,
        r.city,
        r.match_score,
        r.status,
        r.screening_disabled ? 'yes' : 'no',
        Array.isArray(r.skills) ? r.skills.join('; ') : '',
        r.created_at,
      ]
        .map(escape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
