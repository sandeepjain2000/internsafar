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
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';

export default function InternshipDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [internship, setInternship] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState(false);
  const [wallet, setWallet] = useState({ points: null });
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    fetch(`/api/ip/candidate/internships/${id}`).then((r) => r.json()).then((d) => {
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
        const missing = questions.some((q, idx) => {
          const key = q.id || `q${idx}`;
          return !String(answers[key] || '').trim();
        });
        if (missing) {
          throw new Error('Please answer all screening questions before applying.');
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

  if (!internship) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between gap-2">
            <div>
              <CardTitle className="text-xl">{internship.title}</CardTitle>
              <CardDescription>{internship.company_name} · {internship.location || internship.work_mode}</CardDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                <ValidationScoreButton
                  score={internship.validation_score}
                  label={internship.validation_label}
                  breakdown={internship.validation_breakdown}
                />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={toggleSave}>{saved ? 'Saved' : 'Save'}</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <Alert variant="destructive"><AlertTitle>Could not apply</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
          {!profileComplete ? (
            <Alert>
              <AlertTitle>Fill your profile</AlertTitle>
              <AlertDescription>
                You can still apply. Completing your{' '}
                <Link href="/candidate/profile" className="underline font-medium">
                  profile
                </Link>{' '}
                helps employers and improves your match score.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex gap-2 flex-wrap">
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
            {internship.show_hiring_numbers ? <Badge>Actively hiring</Badge> : null}
          </div>
          {internship.stipend_type === 'incentive' && internship.incentive_basis ? (
            <div>
              <h3 className="font-medium mb-1">Incentive basis</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{internship.incentive_basis}</p>
            </div>
          ) : null}
          <div>
            <h3 className="font-medium mb-1">Description</h3>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{internship.description || 'No description provided.'}</p>
          </div>
          {internship.eligibility?.skills?.length ? (
            <div>
              <h3 className="font-medium mb-1">Preferred skills</h3>
              <div className="flex gap-1 flex-wrap">
                {internship.eligibility.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
              </div>
            </div>
          ) : null}

          {questions.length ? (
            <div className="space-y-3 border rounded-md p-3">
              <h3 className="font-medium">Screening questions</h3>
              {questions.map((q, idx) => {
                const key = q.id || `q${idx}`;
                return (
                  <Field key={key}>
                    <FieldLabel>{q.prompt || q.question || `Question ${idx + 1}`}</FieldLabel>
                    {q.type === 'textarea' ? (
                      <Textarea rows={3} value={answers[key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))} />
                    ) : (
                      <Input value={answers[key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))} />
                    )}
                  </Field>
                );
              })}
            </div>
          ) : null}

          <Alert>
            <AlertTitle>Application cost</AlertTitle>
            <AlertDescription>
              Each apply costs {POINTS_PER_APPLICATION} points
              {wallet.points != null ? ` (you have ${wallet.points})` : ''}.
            </AlertDescription>
          </Alert>

          <Button onClick={apply} disabled={applying || Boolean(message)}>
            {applying ? 'Applying…' : message ? 'Applied' : 'Apply now'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
