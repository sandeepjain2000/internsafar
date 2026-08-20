/**
 * Screening questions: text (legacy) + MCQ with optional application-disabling trigger answers.
 * Max five questions. Disabling only from explicitly configured trigger option IDs — never inferred from text.
 */

export const MAX_SCREENING_QUESTIONS = 5;

function newOptionId(qIdx, oIdx) {
  return `q${qIdx + 1}_opt${oIdx + 1}`;
}

/**
 * Normalize employer-submitted questions for storage.
 * Accepts legacy text prompts and structured MCQs.
 */
export function normalizeScreeningQuestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < list.length && out.length < MAX_SCREENING_QUESTIONS; i += 1) {
    const q = list[i];
    if (typeof q === 'string') {
      const prompt = q.trim();
      if (!prompt) continue;
      out.push({
        id: `q${out.length + 1}`,
        prompt,
        type: 'text',
        required: true,
        order: out.length,
      });
      continue;
    }
    if (!q || typeof q !== 'object') continue;
    const prompt = String(q.prompt || '').trim();
    if (!prompt) continue;
    const type = String(q.type || 'text').toLowerCase() === 'mcq' ? 'mcq' : 'text';
    const id = String(q.id || `q${out.length + 1}`).trim() || `q${out.length + 1}`;
    const required = q.required !== false;
    const order = Number.isFinite(Number(q.order)) ? Number(q.order) : out.length;

    if (type === 'mcq') {
      const rawOpts = Array.isArray(q.options) ? q.options : [];
      const options = [];
      for (let oi = 0; oi < rawOpts.length; oi += 1) {
        const o = rawOpts[oi];
        if (typeof o === 'string') {
          const label = o.trim();
          if (!label) continue;
          options.push({ id: newOptionId(out.length, options.length), label, disablesApplication: false });
          continue;
        }
        if (!o || typeof o !== 'object') continue;
        const label = String(o.label || o.text || '').trim();
        if (!label) continue;
        options.push({
          id: String(o.id || newOptionId(out.length, options.length)).trim(),
          label,
          disablesApplication: Boolean(o.disablesApplication),
        });
      }
      if (options.length < 2) {
        continue; // skip invalid MCQ
      }
      const disableEnabled = Boolean(q.disableApplicationOnAnswers) || options.some((o) => o.disablesApplication);
      // Prefer explicit trigger option ids list
      let triggerIds = Array.isArray(q.disableTriggerOptionIds)
        ? q.disableTriggerOptionIds.map(String)
        : options.filter((o) => o.disablesApplication).map((o) => o.id);
      if (disableEnabled) {
        options.forEach((o) => {
          o.disablesApplication = triggerIds.includes(o.id);
        });
      } else {
        options.forEach((o) => {
          o.disablesApplication = false;
        });
        triggerIds = [];
      }
      out.push({
        id,
        prompt,
        type: 'mcq',
        required,
        order,
        options,
        disableApplicationOnAnswers: disableEnabled && triggerIds.length > 0,
        disableTriggerOptionIds: triggerIds,
      });
    } else {
      out.push({ id, prompt, type: 'text', required, order });
    }
  }
  return out.map((q, idx) => ({ ...q, order: idx }));
}

export function validateScreeningQuestions(questions) {
  const errors = [];
  if (!Array.isArray(questions)) {
    return { errors: ['Questions must be an array'], questions: [] };
  }
  if (questions.length > MAX_SCREENING_QUESTIONS) {
    errors.push(`At most ${MAX_SCREENING_QUESTIONS} screening questions are allowed`);
  }
  const normalized = normalizeScreeningQuestions(questions);
  for (const q of normalized) {
    if (q.type === 'mcq') {
      if (!q.options || q.options.length < 2) {
        errors.push(`MCQ "${q.prompt}" needs at least two options`);
      }
      if (q.disableApplicationOnAnswers) {
        const triggers = (q.options || []).filter((o) => o.disablesApplication);
        if (!triggers.length) {
          errors.push(`MCQ "${q.prompt}" has application disabling enabled but no trigger answers`);
        }
      }
    }
  }
  return { errors, questions: normalized };
}

/**
 * Validate candidate answers against question defs (use snapshot or live).
 * Optional questions may be skipped (empty).
 */
export function validateScreeningAnswers(questions, answers) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  const missing = [];
  for (const q of questions || []) {
    const key = q.id;
    const raw = ans[key];
    const value = raw == null ? '' : String(typeof raw === 'object' ? raw.optionId || raw.value || '' : raw).trim();
    if (q.required !== false && !value) {
      missing.push(q.id);
      continue;
    }
    if (q.type === 'mcq' && value) {
      const ok = (q.options || []).some((o) => o.id === value || o.label === value);
      if (!ok) missing.push(q.id);
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Evaluate whether answers hit any configured disable trigger.
 * Returns { disabled, reason } — reason lists first matching trigger.
 */
export function evaluateScreeningDisable(questions, answers) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  for (const q of questions || []) {
    if (q.type !== 'mcq' || !q.disableApplicationOnAnswers) continue;
    const raw = ans[q.id];
    const optionId = raw == null
      ? ''
      : String(typeof raw === 'object' ? raw.optionId || raw.value || '' : raw).trim();
    if (!optionId) continue;
    const opt = (q.options || []).find((o) => o.id === optionId || o.label === optionId);
    if (opt && opt.disablesApplication) {
      return {
        disabled: true,
        reason: {
          questionId: q.id,
          prompt: q.prompt,
          optionId: opt.id,
          optionLabel: opt.label,
        },
      };
    }
  }
  return { disabled: false, reason: null };
}

/** Snapshot for historical integrity when posting questions change later. */
export function snapshotQuestions(questions) {
  return JSON.parse(JSON.stringify(questions || []));
}

/** Normalize answer map to option ids / strings for storage. */
export function normalizeAnswersForStorage(questions, answers) {
  const ans = answers && typeof answers === 'object' ? answers : {};
  const out = {};
  for (const q of questions || []) {
    const raw = ans[q.id];
    if (raw == null || raw === '') continue;
    if (typeof raw === 'object') {
      out[q.id] = String(raw.optionId || raw.value || raw.label || '').trim();
    } else {
      out[q.id] = String(raw).trim();
    }
  }
  return out;
}
