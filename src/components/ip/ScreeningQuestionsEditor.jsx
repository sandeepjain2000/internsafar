'use client';

import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MAX_SCREENING_QUESTIONS } from '@/lib/ipScreeningQuestions';

function blankQuestion() {
  return {
    id: `q${Date.now()}`,
    prompt: '',
    type: 'mcq',
    required: true,
    options: [
      { id: `opt_${Date.now()}_a`, label: '', disablesApplication: false },
      { id: `opt_${Date.now()}_b`, label: '', disablesApplication: false },
    ],
    disableApplicationOnAnswers: false,
    disableTriggerOptionIds: [],
  };
}

/** Employer MCQ builder: prompt → required → options → optional disable toggle → trigger answers. */
export default function ScreeningQuestionsEditor({ questions = [], onChange }) {
  const list = Array.isArray(questions) ? questions : [];

  function update(idx, patch) {
    onChange(list.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }

  function updateOption(qIdx, oIdx, patch) {
    const q = list[qIdx];
    const options = (q.options || []).map((o, i) => (i === oIdx ? { ...o, ...patch } : o));
    const triggerIds = options.filter((o) => o.disablesApplication).map((o) => o.id);
    update(qIdx, {
      options,
      disableTriggerOptionIds: triggerIds,
      disableApplicationOnAnswers: q.disableApplicationOnAnswers && triggerIds.length > 0
        ? true
        : q.disableApplicationOnAnswers,
    });
  }

  function addQuestion() {
    if (list.length >= MAX_SCREENING_QUESTIONS) return;
    onChange([...list, blankQuestion()]);
  }

  function removeQuestion(idx) {
    onChange(list.filter((_, i) => i !== idx));
  }

  function addOption(qIdx) {
    const q = list[qIdx];
    const options = [
      ...(q.options || []),
      { id: `opt_${Date.now()}`, label: '', disablesApplication: false },
    ];
    update(qIdx, { options });
  }

  function removeOption(qIdx, oIdx) {
    const q = list[qIdx];
    const options = (q.options || []).filter((_, i) => i !== oIdx);
    update(qIdx, { options });
  }

  function setDisableToggle(qIdx, enabled) {
    const q = list[qIdx];
    const options = (q.options || []).map((o) => ({
      ...o,
      disablesApplication: enabled ? o.disablesApplication : false,
    }));
    update(qIdx, {
      disableApplicationOnAnswers: enabled,
      options,
      disableTriggerOptionIds: enabled ? options.filter((o) => o.disablesApplication).map((o) => o.id) : [],
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Optional screening questions for candidates (not an exam). They pick one option each.
        Optional questions may be skipped. You can mark specific answers so those applications are
        flagged in your applicant table — they are still inspectable.
      </p>
      {list.map((q, idx) => (
        <div key={q.id || idx} className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>Question {idx + 1}</FieldLabel>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(idx)}>
              Remove
            </Button>
          </div>
          <Field>
            <FieldLabel>Question text</FieldLabel>
            <Input
              value={q.prompt || ''}
              onChange={(e) => update(idx, { prompt: e.target.value })}
              placeholder="e.g. Which city will you work from?"
            />
          </Field>
          <Field>
            <FieldLabel>Required?</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={q.required === false ? 'optional' : 'required'}
              onChange={(e) => update(idx, { required: e.target.value === 'required' })}
            >
              <option value="required">Mandatory</option>
              <option value="optional">Optional</option>
            </select>
          </Field>
          <div className="space-y-2">
            <FieldLabel>Answer options</FieldLabel>
            {(q.options || []).map((o, oIdx) => (
              <div key={o.id || oIdx} className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1 min-w-[12rem]"
                  value={o.label || ''}
                  onChange={(e) => updateOption(idx, oIdx, { label: e.target.value })}
                  placeholder={`Option ${oIdx + 1}`}
                />
                {q.disableApplicationOnAnswers ? (
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={Boolean(o.disablesApplication)}
                      onChange={(e) => updateOption(idx, oIdx, { disablesApplication: e.target.checked })}
                    />
                    Trigger disable
                  </label>
                ) : null}
                <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(idx, oIdx)}>
                  ×
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addOption(idx)}>
              Add option
            </Button>
          </div>
          <Field>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(q.disableApplicationOnAnswers)}
                onChange={(e) => setDisableToggle(idx, e.target.checked)}
              />
              <span>
                <span className="font-medium">Disable / grey-out application at source based on response</span>
                <FieldDescription className="mt-1">
                  When enabled, select one or more trigger answers above. Candidates who pick a trigger
                  answer still submit an application; it appears greyed out in your applicant table and
                  remains filterable. This works for any question topic — only the options you mark as
                  triggers matter.
                </FieldDescription>
              </span>
            </label>
          </Field>
          {q.disableApplicationOnAnswers ? (
            <Alert>
              <AlertTitle>Before you publish</AlertTitle>
              <AlertDescription>
                Trigger answers will mark matching applications as screening-disabled (greyed out).
                They are not deleted. You can still inspect answers and profiles.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ))}
      {list.length < MAX_SCREENING_QUESTIONS ? (
        <Button type="button" variant="outline" onClick={addQuestion}>
          {list.length ? 'Add another question?' : 'Add a question'}
        </Button>
      ) : null}
    </div>
  );
}
