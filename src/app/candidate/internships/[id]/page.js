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
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';
import { formatInternshipLocations } from '@/lib/ipInternshipLocations';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'misleading', label: 'Misleading details' },
  { value: 'scam', label: 'Suspected scam' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'duplicate', label: 'Duplicate listing' },
  { value: 'other', label: 'Other' },
];

const APPLY_DRAFT_PREFIX = 'ip_apply_draft_';

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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('misleading');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMsg, setReportMsg] = useState('');
  const [reporting, setReporting] = useState(false);
  const [draftHint, setDraftHint] = useState('');
  const [alreadyApplied, setAlreadyApplied] = useState(false);
  const [previouslyWithdrawn, setPreviouslyWithdrawn] = useState(false);

  useEffect(() => {
    fetch(`/api/ip/candidate/internships/${id}`).then((r) => r.json()).then((d) => {
      if (!d.internship) {
        setMissing(true);
        return;
      }
      setInternship(d.internship);
      setAlreadyApplied(Boolean(d.internship.applied));
      setPreviouslyWithdrawn(Boolean(d.internship.previouslyWithdrawn));
      const qs = Array.isArray(d.internship?.questions) ? d.internship.questions : [];
      const init = {};
      qs.forEach((q, idx) => { init[q.id || `q${idx}`] = ''; });
      try {
        const raw = localStorage.getItem(`${APPLY_DRAFT_PREFIX}${id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.assign(init, parsed);
            setDraftHint('Restored your saved screening answers from this device.');
          }
        }
      } catch {
        /* ignore */
      }
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

  useEffect(() => {
    if (!id || !Object.keys(answers).length) return undefined;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`${APPLY_DRAFT_PREFIX}${id}`, JSON.stringify(answers));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [id, answers]);

  async function toggleSave() {
    await fetch('/api/ip/candidate/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internshipId: id, saved: !saved }),
    });
    setSaved(!saved);
  }

  async function submitReport() {
    setReporting(true);
    setReportMsg('');
    try {
      const res = await fetch('/api/ip/candidate/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          internshipId: id,
          reason: reportReason,
          details: reportDetails,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report failed');
      setReportMsg('Thanks — your report was submitted for review.');
      setReportOpen(false);
      setReportDetails('');
    } catch (err) {
      setReportMsg(err.message);
    } finally {
      setReporting(false);
    }
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
      try {
        localStorage.removeItem(`${APPLY_DRAFT_PREFIX}${id}`);
      } catch {
        /* ignore */
      }
      setDraftHint('');
      setAlreadyApplied(true);
      setMessage(`Applied successfully! Spent ${data.payment?.cost ?? POINTS_PER_APPLICATION} points.`);
      setTimeout(() => router.push('/candidate/applications'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const applyLabel = applying
    ? 'Applying…'
    : alreadyApplied || message
      ? 'Already applied'
      : previouslyWithdrawn
        ? 'Apply again'
        : 'Apply now';
  const applyDisabled = applying || alreadyApplied || Boolean(message);

  if (missing) {
    return (
      <div className="p-8 space-y-4">
        <Button type="button" variant="outline" size="sm" render={<Link href="/candidate/internships" />} nativeButton={false}>
          ← Back to internships
        </Button>
        <Alert>
          <AlertTitle>Unavailable</AlertTitle>
          <AlertDescription>This internship is no longer available.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!internship) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="ip-cand-intern-detail ip-mobile-bleed space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" render={<Link href="/candidate/internships" />} nativeButton={false}>
          ← Back to internships
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="ip-id-head flex justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-xl">{internship.title}</CardTitle>
              <CardDescription>
                {[internship.company_name, formatInternshipLocations(internship) || internship.work_mode]
                  .filter(Boolean)
                  .join(' · ')}
              </CardDescription>
              <div className="mt-2 flex flex-wrap gap-2">
                <ValidationScoreButton
                  score={internship.validation_score}
                  label={internship.validation_label}
                  breakdown={internship.validation_breakdown}
                />
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Button size="sm" variant="outline" className="ip-id-save" onClick={toggleSave}>
                {saved ? 'Saved' : 'Save'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReportOpen((v) => !v)}>
                Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <Alert variant="destructive"><AlertTitle>Could not apply</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
          {reportMsg ? <Alert><AlertDescription>{reportMsg}</AlertDescription></Alert> : null}
          {draftHint ? <Alert><AlertDescription>{draftHint}</AlertDescription></Alert> : null}
          {previouslyWithdrawn && !alreadyApplied ? (
            <Alert>
              <AlertTitle>You withdrew earlier</AlertTitle>
              <AlertDescription>
                You can apply again while this posting is still open. Your withdrawn application will be reopened as a new submission (points are charged again).
              </AlertDescription>
            </Alert>
          ) : null}
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

          {reportOpen ? (
            <div className="space-y-2 rounded-md border p-3">
              <h3 className="font-medium text-sm">Report this listing</h3>
              <Field>
                <FieldLabel>Reason</FieldLabel>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </Field>
              <Field>
                <FieldLabel>Details (optional)</FieldLabel>
                <Textarea rows={3} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={submitReport} disabled={reporting}>
                  {reporting ? 'Sending…' : 'Submit report'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setReportOpen(false)}>Cancel</Button>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">
              {formatInternshipStipend(internship, { unpaidLabel: 'Unpaid / not specified' })
                || 'Unpaid / not specified'}
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
                    <FieldLabel>
                      {q.prompt || q.question || `Question ${idx + 1}`}
                      {q.required === false ? ' (optional)' : ''}
                    </FieldLabel>
                    {q.type === 'mcq' && Array.isArray(q.options) ? (
                      <div className="space-y-1 mt-1" role="radiogroup" aria-label={q.prompt}>
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

          <Alert>
            <AlertTitle>Application cost</AlertTitle>
            <AlertDescription>
              Each apply costs {POINTS_PER_APPLICATION} points
              {wallet.points != null ? ` (you have ${wallet.points})` : ''}.
            </AlertDescription>
          </Alert>

          <div className="ip-only-desktop">
            <Button onClick={apply} disabled={applyDisabled}>
              {applyLabel}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="ip-id-apply-bar ip-only-mobile" role="region" aria-label="Apply">
        <Button className="ip-id-apply-bar__btn w-full" onClick={apply} disabled={applyDisabled}>
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}
