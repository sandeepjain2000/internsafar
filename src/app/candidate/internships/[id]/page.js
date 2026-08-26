'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ValidationScoreButton from '@/components/ip/ValidationScoreButton';
import ScoreInsightBar from '@/components/ip/ScoreInsightBar';
import PostingBodySections from '@/components/ip/PostingBodySections';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';

export default function InternshipDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [internship, setInternship] = useState(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState(false);
  const [wallet, setWallet] = useState({ points: null });
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    fetch(`/api/ip/candidate/internships/${id}`).then((r) => r.json()).then((d) => {
      if (!d.internship) {
        setMissing(true);
        return;
      }
      setInternship(d.internship);
      const qs = Array.isArray(d.internship?.questions) ? d.internship.questions : [];
      const init = {};
      qs.forEach((q, idx) => { init[q.id || `q${idx}`] = ''; });
      setAnswers(init);
    }).catch(() => {});
    fetch('/api/ip/candidate/saved').then((r) => r.json()).then((d) => {
      setSaved((d.items || []).some((i) => i.id === id));
    }).catch(() => {});
    fetch('/api/ip/candidate/profile').then((r) => r.json()).then((d) => {
      setWallet({
        points: d.profile?.points ?? null,
      });
      setProfileComplete(Boolean(d.profile?.profile_complete));
    }).catch(() => {});
  }, [id]);

  async function toggleSave() {
    await fetch('/api/ip/candidate/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internshipId: id, saved: !saved }),
    });
    setSaved(!saved);
  }

  const questions = Array.isArray(internship?.questions) ? internship.questions : [];

  async function apply() {
    setApplying(true);
    setError('');
    try {
      if (questions.length) {
        const missingQ = questions.some((q, idx) => {
          if (q.required === false) return false;
          const key = q.id || `q${idx}`;
          return !String(answers[key] || '').trim();
        });
        if (missingQ) {
          throw new Error('Please answer all required screening questions before applying.');
        }
      }
      const res = await fetch('/api/ip/candidate/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId: id, answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (typeof data.pointsRemaining === 'number') {
        setWallet({ points: data.pointsRemaining });
      }
      setMessage(`Applied successfully! Spent ${data.payment?.cost ?? POINTS_PER_APPLICATION} points.`);
      setTimeout(() => router.push('/candidate/applications'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  if (missing) {
    return (
      <div className="p-8">
        <Alert>
          <AlertTitle>Unavailable</AlertTitle>
          <AlertDescription>This internship is no longer available.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!internship) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl leading-snug">{internship.title}</CardTitle>
              <CardDescription className="mt-1">
                {internship.company_name} · {internship.location || internship.work_mode}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={toggleSave}>{saved ? 'Saved' : 'Save'}</Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {internship.applicant_readonly_view ? (
            <Alert>
              <AlertTitle>Not open for new applications</AlertTitle>
              <AlertDescription>
                You already applied to this role
                {internship.lifecycle_label ? ` (${internship.lifecycle_label})` : ''}. You can review the listing here; new applications are not accepted right now.
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? <Alert variant="destructive"><AlertTitle>Could not apply</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
          {!profileComplete ? (
            <Alert>
              <AlertTitle>Fill your profile</AlertTitle>
              <AlertDescription>
                You can still apply. Completing your{' '}
                <Link href="/candidate/profile" className="font-medium underline">
                  profile
                </Link>{' '}
                helps employers and improves your match score.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {internship.stipend_type === 'incentive'
                ? 'Incentive-based'
                : internship.stipend_inr
                  ? `₹${internship.stipend_inr}/mo`
                  : 'Unpaid / not specified'}
            </Badge>
            {internship.stipend_type === 'fixed' ? <Badge variant="secondary">Fixed stipend</Badge> : null}
            <Badge variant="outline">Duration: {internship.duration_months ? `${internship.duration_months} months` : '—'}</Badge>
            <Badge variant="outline">Mode: {internship.work_mode || '—'}</Badge>
            {internship.engagement_type === 'full_time' ? <Badge variant="secondary">Full-time</Badge> : null}
            {internship.engagement_type === 'part_time' ? (
              <Badge variant="secondary">Part-time{internship.weekly_hours ? ` · ${internship.weekly_hours}h/wk` : ''}</Badge>
            ) : null}
            {internship.work_hours_start && internship.work_hours_end ? (
              <Badge variant="outline">Hours: {internship.work_hours_start}–{internship.work_hours_end}</Badge>
            ) : null}
            {internship.application_volume_label ? (
              <Badge variant="secondary" title="Historical applications (range)">
                {internship.application_volume_label} applications
              </Badge>
            ) : null}
            {internship.show_hiring_numbers && !internship.application_volume_label ? (
              <Badge>Actively hiring</Badge>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ScoreInsightBar
              kind="match"
              score={internship.match_score}
              size="detail"
              matchDetail={internship.match_detail}
              why={internship.match_why}
            />
            <div className="flex flex-col gap-2">
              <ScoreInsightBar
                kind="validation"
                score={internship.validation_score}
                size="detail"
                breakdown={internship.validation_breakdown}
                why={internship.validation_why}
              />
              <ValidationScoreButton
                score={internship.validation_score}
                label={internship.validation_label}
                breakdown={internship.validation_breakdown}
              />
            </div>
          </div>

          {internship.stipend_type === 'incentive' && internship.incentive_basis ? (
            <div>
              <h3 className="mb-1 font-medium">Incentive basis</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{internship.incentive_basis}</p>
            </div>
          ) : null}

          <PostingBodySections internship={internship} />

          {internship.eligibility?.skills?.length ? (
            <div>
              <h3 className="mb-1 font-medium">Preferred skills</h3>
              <div className="flex flex-wrap gap-1">
                {internship.eligibility.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
              </div>
            </div>
          ) : null}

          {questions.length && !internship.already_applied ? (
            <div className="space-y-3 rounded-md border p-3">
              <h3 className="font-medium">Screening questions</h3>
              {questions.map((q, idx) => {
                const key = q.id || `q${idx}`;
                return (
                  <Field key={key}>
                    <FieldLabel>
                      {q.prompt || q.question || `Question ${idx + 1}`}
                      {q.required === false ? ' (optional)' : ''}
                    </FieldLabel>
                    {q.type === 'mcq' && Array.isArray(q.options) ? (
                      <div className="mt-1 space-y-1" role="radiogroup" aria-label={q.prompt}>
                        {q.options.map((o) => (
                          <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`q-${key}`}
                              checked={answers[key] === o.id}
                              onChange={() => setAnswers((a) => ({ ...a, [key]: o.id }))}
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    ) : q.type === 'textarea' ? (
                      <Textarea rows={3} value={answers[key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))} />
                    ) : (
                      <Input value={answers[key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))} />
                    )}
                  </Field>
                );
              })}
            </div>
          ) : null}

          {internship.already_applied ? (
            <Alert>
              <AlertTitle>Already applied</AlertTitle>
              <AlertDescription>
                You can track this role under{' '}
                <Link href="/candidate/applications" className="font-medium underline">
                  My Applications
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertTitle>Application cost</AlertTitle>
                <AlertDescription>
                  Each apply costs {POINTS_PER_APPLICATION} points
                  {wallet.points != null ? ` (you have ${wallet.points})` : ''}.
                </AlertDescription>
              </Alert>

              <Button
                onClick={apply}
                disabled={applying || Boolean(message) || internship.accepting_applications === false}
              >
                {applying
                  ? 'Applying…'
                  : message
                    ? 'Applied'
                    : internship.accepting_applications === false
                      ? 'Not accepting applications'
                      : 'Apply now'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
