'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import PostingBodySections from '@/components/ip/PostingBodySections';

/** Employer-only preview of candidate-facing posting + MCQ form. */
export default function InternshipCandidatePreview({ internship, onClose }) {
  const questions = Array.isArray(internship?.questions) ? internship.questions : [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl space-y-3">
        <Alert>
          <AlertTitle>Preview only</AlertTitle>
          <AlertDescription>
            This is how candidates see this posting. Applications are not submitted from preview.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-xl">{internship.title}</CardTitle>
                <CardDescription>
                  {internship.company_name} · {internship.location || internship.work_mode}
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close preview</Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {internship.stipend_type === 'incentive'
                  ? 'Incentive-based'
                  : internship.stipend_inr
                    ? `₹${internship.stipend_inr}/mo`
                    : 'Unpaid / not specified'}
              </Badge>
              <Badge variant="outline">Mode: {internship.work_mode || '—'}</Badge>
              {internship.application_volume_label ? (
                <Badge variant="secondary" title="Application volume range">
                  {internship.application_volume_label} applications
                </Badge>
              ) : null}
            </div>
            <PostingBodySections internship={internship} />
            {internship.eligibility?.skills?.length ? (
              <div className="flex flex-wrap gap-1">
                {internship.eligibility.skills.map((s) => (
                  <Badge key={s} variant="secondary">{s}</Badge>
                ))}
              </div>
            ) : null}
            {questions.length ? (
              <div className="space-y-3 rounded-md border p-3">
                <h3 className="font-medium">Screening questions (preview)</h3>
                {questions.map((q, idx) => (
                  <Field key={q.id || idx}>
                    <FieldLabel>
                      {q.prompt}
                      {q.required === false ? ' (optional)' : ''}
                    </FieldLabel>
                    {q.type === 'mcq' ? (
                      <div className="space-y-1">
                        {(q.options || []).map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input type="radio" name={`preview-${q.id}`} disabled />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ) : (
                      <Input disabled placeholder="Text answer" />
                    )}
                  </Field>
                ))}
              </div>
            ) : null}
            <Button type="button" disabled>Apply (preview only)</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
