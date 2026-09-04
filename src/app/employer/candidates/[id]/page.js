'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import PageHeader from '@/components/ip/PageHeader';
import {
  experienceEntries,
  experienceEntryLabel,
  experienceIsFreeText,
  experienceRangeLabel,
  experienceSummaryLabel,
} from '@/lib/ipCandidateExperience';
import '@/components/ip/ip-employer-candidate-detail-gemini.css';

export default function EmployerCandidateProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const applicationId = searchParams.get('applicationId') || '';
  const internshipId = searchParams.get('internshipId') || '';
  const from = searchParams.get('from') || (internshipId ? `/employer/internships/${internshipId}` : '/employer/candidates');

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [noteBody, setNoteBody] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [msgBusy, setMsgBusy] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerErr, setOfferErr] = useState('');
  const [offerForm, setOfferForm] = useState({
    roleTitle: '',
    stipendInr: '',
    startDate: '',
    validUntil: '',
    message: '',
  });

  const load = useCallback(async () => {
    const qs = applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : '';
    const res = await fetch(`/api/ip/employer/candidates/${id}${qs}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Not found');
      setData(null);
      return;
    }
    setError('');
    setData(json);
    const appId = json.application?.id;
    if (!appId) {
      setNotes([]);
      setTimeline([]);
      return;
    }
    const [n, t] = await Promise.all([
      fetch(`/api/ip/employer/applications/${appId}/notes`).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/ip/employer/applications/${appId}/events`).then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    setNotes(n.items || []);
    setTimeline(t.items || []);
  }, [id, applicationId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    const appId = data?.application?.id;
    if (!appId || !noteBody.trim()) return;
    await fetch(`/api/ip/employer/applications/${appId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: noteBody }),
    });
    setNoteBody('');
    await load();
  }

  async function saveReminder() {
    const appId = data?.application?.id;
    if (!appId || !reminderAt) return;
    await fetch('/api/ip/employer/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: appId,
        internshipId: data.application.internship_id || internshipId,
        remindAt: new Date(reminderAt).toISOString(),
        note: reminderNote,
      }),
    });
    setReminderAt('');
    setReminderNote('');
    window.alert('Reminder saved');
  }

  async function goMessage() {
    const candidateName = data?.candidate?.name || '';
    const appId = data?.application?.id;
    setMsgBusy(true);
    try {
      const res = await fetch('/api/ip/messages/threads');
      const json = await res.json().catch(() => ({}));
      const items = json.items || [];
      const match = items.find((t) => (
        (appId && t.application_id === appId)
        || (candidateName
          && String(t.candidate_name || '').toLowerCase() === candidateName.toLowerCase())
      ));
      if (match?.id) {
        router.push(`/employer/messages?thread=${encodeURIComponent(match.id)}`);
        return;
      }
    } catch {
      /* fall through to inbox */
    } finally {
      setMsgBusy(false);
    }
    router.push('/employer/messages');
  }

  function openOffer() {
    const a = data?.application;
    if (!a) return;
    setOfferForm({
      roleTitle: a.internship_title || '',
      stipendInr: '',
      startDate: '',
      validUntil: '',
      message: '',
    });
    setOfferErr('');
    setOfferOpen(true);
  }

  async function sendOffer() {
    const a = data?.application;
    if (!a?.id) return;
    setOfferBusy(true);
    setOfferErr('');
    try {
      const res = await fetch('/api/ip/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: a.id,
          roleTitle: offerForm.roleTitle,
          stipendInr: offerForm.stipendInr ? Number(offerForm.stipendInr) : null,
          startDate: offerForm.startDate || null,
          validUntil: offerForm.validUntil || null,
          message: offerForm.message || '',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOfferErr(json.error || 'Could not send offer');
        return;
      }
      setOfferOpen(false);
      await load();
    } finally {
      setOfferBusy(false);
    }
  }

  const c = data?.candidate;
  const a = data?.application;
  const hist = c?.internship_history;
  const experience = experienceEntries(c?.prior_experience);
  const experienceIsText = experienceIsFreeText(c?.prior_experience);
  const backHref = from.startsWith('/') ? from : '/employer/candidates';
  const skills = Array.isArray(c?.skills) ? c.skills : [];

  const actionButtons = (
    <div className="ip-ecd-actions">
      <Button type="button" variant="outline" size="sm" disabled={msgBusy || !c} onClick={goMessage}>
        {msgBusy ? 'Opening…' : 'Message'}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!a}
        title={a ? 'Create offer for this application' : 'Offer requires an existing application'}
        onClick={openOffer}
      >
        Offer
      </Button>
    </div>
  );

  return (
    <div className="ip-emp-cand-detail ip-mobile-bleed space-y-4 pb-12">
      <div className="ip-mobile-inset space-y-4">
        <PageHeader
          className="ip-ecd-head"
          title={c?.name || 'Candidate'}
          description="Employer-visible profile (contact details stay hidden until the workflow allows them)."
          actions={(
            <Button variant="outline" size="sm" render={<Link href={backHref} />}>
              Back to list
            </Button>
          )}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!c && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {c ? (
          <div className="ip-ecd-grid grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c.profile_picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.profile_picture_url} alt="" className="h-20 w-20 rounded-full object-cover" />
                ) : null}
                <div className="text-muted-foreground">
                  {[c.degree, c.specialization, c.college, c.city, c.state].filter(Boolean).join(' · ') || '—'}
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">CGPA</dt><dd>{c.cgpa != null ? c.cgpa : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Study status</dt><dd>{c.study_status || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Graduation</dt><dd>{c.graduation_year || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Work preference</dt><dd>{c.preferred_work_mode || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Availability</dt><dd>{c.immediate_start ? 'Immediate' : (c.availability_date || '—')}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Experience</dt><dd>{experience.length ? experienceSummaryLabel(c.prior_experience) : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Relocate</dt><dd>{c.willing_to_relocate ? 'Yes' : '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Ongoing commitment</dt><dd>{c.ongoing_commitment || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Hours</dt><dd>{[c.preferred_hours_start, c.preferred_hours_end].filter(Boolean).join('–') || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Setup</dt><dd>{[c.has_wired_broadband ? 'Broadband' : null, c.has_dedicated_laptop ? 'Laptop' : null].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{c.phone || (c.phone_hidden ? 'Hidden until shortlist/interview' : '—')}</dd></div>
                  {c.linkedin_url ? (
                    <div><dt className="text-xs text-muted-foreground">LinkedIn</dt><dd><a className="underline" href={c.linkedin_url} target="_blank" rel="noreferrer">Profile</a></dd></div>
                  ) : null}
                </dl>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Skills</div>
                  {skills.length ? (
                    <div className="ip-ecd-skills">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary">{s}</Badge>
                      ))}
                    </div>
                  ) : (
                    <div>—</div>
                  )}
                </div>
                {experience.length ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Work experience</div>
                    {experienceIsText ? (
                      <p className="whitespace-pre-line">{experience[0].description}</p>
                    ) : (
                      <ul className="space-y-3 border-l pl-3">
                        {experience.map((entry, idx) => {
                          const range = experienceRangeLabel(entry);
                          return (
                            <li key={entry.id || idx} className="space-y-0.5">
                              <div className="font-medium">{experienceEntryLabel(entry) || 'Experience'}</div>
                              {range ? <div className="text-xs text-muted-foreground">{range}</div> : null}
                              {entry.description ? (
                                <p className="whitespace-pre-line text-muted-foreground">{entry.description}</p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
                {hist ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Internship history</div>
                    <div>
                      {hist.total_internships} total
                      {hist.completed_hidden ? ' · completed hidden' : ` · ${hist.completed_internships} completed`}
                      {` · ${hist.ongoing_internships} ongoing`}
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">Email and resume are not shown in this view.</p>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
                <CardContent>{actionButtons}</CardContent>
              </Card>
              {a ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">This application</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>{a.internship_title || 'Internship'}</div>
                    <Badge variant="outline">{a.status}</Badge>
                    <div>Match {a.match_score != null ? `${a.match_score}%` : '—'}</div>
                    {a.screening_disabled ? <div className="text-muted-foreground">Screening disabled</div> : null}
                    <div className="pt-2">
                      <div className="font-medium mb-1">Screening answers</div>
                      {a.answers && Object.keys(a.answers).length ? (
                        Object.entries(a.answers).map(([k, v]) => {
                          const snap = (a.questions_snapshot || []).find((qq) => qq.id === k);
                          const label = snap?.options?.find((o) => o.id === v)?.label || v;
                          return <div key={k}><strong>{snap?.prompt || k}:</strong> {String(label)}</div>;
                        })
                      ) : <div className="text-muted-foreground">No answers</div>}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="pt-6 text-sm text-muted-foreground">No application with your company yet.</CardContent></Card>
              )}
              {a ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Private notes</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <ul className="space-y-1 text-xs">
                      {notes.map((n) => <li key={n.id} className="border rounded p-1">{n.body}</li>)}
                      {!notes.length ? <li className="text-muted-foreground">No notes</li> : null}
                    </ul>
                    <Textarea rows={2} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add note…" />
                    <Button size="sm" onClick={addNote}>Add note</Button>
                  </CardContent>
                </Card>
              ) : null}
              {a ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {timeline.map((ev) => (
                        <li key={ev.id}>{new Date(ev.created_at).toLocaleString()} — {ev.event_type}</li>
                      ))}
                      {!timeline.length ? <li>No events yet</li> : null}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
              {a ? (
                <Card>
                  <CardHeader><CardTitle className="text-base">Follow-up reminder</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
                    <Input placeholder="Note" value={reminderNote} onChange={(e) => setReminderNote(e.target.value)} />
                    <Button size="sm" onClick={saveReminder}>Save reminder</Button>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={offerOpen} onOpenChange={(open) => !open && setOfferOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send offer to {c?.name || 'candidate'}</DialogTitle>
          </DialogHeader>
          {offerErr ? <p className="text-sm text-destructive">{offerErr}</p> : null}
          <div className="space-y-3">
            <Field>
              <FieldLabel>Role title</FieldLabel>
              <Input
                value={offerForm.roleTitle}
                onChange={(e) => setOfferForm((f) => ({ ...f, roleTitle: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Stipend (INR/mo)</FieldLabel>
              <Input
                type="number"
                value={offerForm.stipendInr}
                onChange={(e) => setOfferForm((f) => ({ ...f, stipendInr: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Start date</FieldLabel>
              <Input
                type="date"
                value={offerForm.startDate}
                onChange={(e) => setOfferForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Valid until</FieldLabel>
              <Input
                type="date"
                value={offerForm.validUntil}
                onChange={(e) => setOfferForm((f) => ({ ...f, validUntil: e.target.value }))}
              />
            </Field>
            <Field>
              <FieldLabel>Message</FieldLabel>
              <Textarea
                rows={3}
                value={offerForm.message}
                onChange={(e) => setOfferForm((f) => ({ ...f, message: e.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferOpen(false)}>Cancel</Button>
            <Button disabled={offerBusy} onClick={sendOffer}>
              {offerBusy ? 'Sending…' : 'Send offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
