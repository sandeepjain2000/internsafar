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
import { toTitleCaseLabel } from '@/lib/ipTitleCase';
import {
  experienceEntries,
  experienceEntryLabel,
  experienceIsFreeText,
  experienceRangeLabel,
  experienceSummaryLabel,
} from '@/lib/ipCandidateExperience';
import '@/components/ip/ip-employer-candidate-detail-gemini.css';

function formatDay(value) {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function matchLabel(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n)}%` : null;
}

function yesNo(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

/** Candidate-entered URLs: only http(s) or our file route; bare domains get https://. */
function safeHref(raw) {
  const url = String(raw || '').trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url) || url.startsWith('/api/ip/files?')) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url)) return `https://${url}`;
  return null;
}

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

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
    const otherUserId = data?.candidate?.user_id;
    const intId = data?.application?.internship_id || internshipId || null;
    if (!otherUserId) {
      window.alert('Cannot open chat — candidate account is missing.');
      return;
    }
    setMsgBusy(true);
    try {
      const res = await fetch('/api/ip/messages/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otherUserId,
          internshipId: intId || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not open chat');
      if (!json.threadId) throw new Error('Chat channel was not created');
      router.push(`/employer/messages?thread=${encodeURIComponent(json.threadId)}`);
    } catch (err) {
      window.alert(err.message || 'Could not open chat');
    } finally {
      setMsgBusy(false);
    }
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
  const location = c ? [c.city, c.state, c.country].filter(Boolean).join(', ') : '';
  const availability = c?.immediate_start ? 'Immediate' : (formatDay(c?.availability_date) || '—');
  const links = c
    ? [
        { key: 'linkedin', label: 'LinkedIn', href: safeHref(c.linkedin_url) },
        { key: 'github', label: 'GitHub', href: safeHref(c.github_url) },
        { key: 'portfolio', label: 'Portfolio', href: safeHref(c.portfolio_url) },
        { key: 'website', label: 'Website', href: safeHref(c.personal_website) },
        { key: 'cv', label: 'View CV', href: safeHref(c.resume_url) },
        ...(c.resume_links || []).map((l, i) => ({
          key: `cv-link-${i}`,
          label: l.title || `CV link ${i + 1}`,
          href: safeHref(l.url),
        })),
      ].filter((l) => l.href)
    : [];
  const academics = c?.academics || [];
  const companyApps = c?.applications || [];
  const offers = c?.offers || [];
  const endorsements = c?.endorsements || [];

  const actionButtons = (
    <div className="ip-ecd-actions">
      <Button type="button" variant="outline" size="sm" disabled={msgBusy || !c} onClick={goMessage}>
        {msgBusy ? 'Opening…' : 'Message'}
      </Button>
      {a ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          render={
            <a
              href={`/api/ip/employer/candidates/${encodeURIComponent(id)}/download?applicationId=${encodeURIComponent(a.id)}`}
            />
          }
          nativeButton={false}
        >
          Download Excel + CV
        </Button>
      ) : null}
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
                  {[c.degree, c.specialization, c.college].filter(Boolean).join(' · ') || '—'}
                </div>
                <dl className="ip-ecd-dl grid grid-cols-2 gap-x-4 gap-y-2" data-testid="employer-candidate-fields">
                  <Row label="Email">
                    {c.email ? <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> : (c.contact_gated ? 'Shown after they apply to your company' : '—')}
                  </Row>
                  <Row label="Phone">{c.phone || (c.phone_hidden ? 'Hidden until shortlist/interview' : '—')}</Row>
                  <Row label="Location">{location || '—'}</Row>
                  <Row label="CGPA">{c.cgpa != null ? c.cgpa : '—'}</Row>
                  <Row label="Study status">{c.study_status || '—'}</Row>
                  <Row label="Graduation">{c.graduation_year || '—'}</Row>
                  <Row label="Work preference">{c.preferred_work_mode || '—'}</Row>
                  <Row label="Preferred locations">{c.preferred_locations?.length ? c.preferred_locations.join(', ') : '—'}</Row>
                  <Row label="Preferred roles">{c.preferred_roles?.length ? c.preferred_roles.join(', ') : '—'}</Row>
                  <Row label="Availability">{availability}</Row>
                  <Row label="Hours">{[c.preferred_hours_start, c.preferred_hours_end].filter(Boolean).join('–') || '—'}</Row>
                  <Row label="Ongoing commitment">{c.ongoing_commitment_label || '—'}</Row>
                  <Row label="Willing to relocate">{yesNo(c.willing_to_relocate)}</Row>
                  <Row label="Wired broadband">{yesNo(c.has_wired_broadband)}</Row>
                  <Row label="Dedicated laptop">{yesNo(c.has_dedicated_laptop)}</Row>
                  <Row label="Experience">{experience.length ? experienceSummaryLabel(c.prior_experience) : '—'}</Row>
                </dl>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Links</div>
                  {links.length ? (
                    <div className="ip-ecd-links" data-testid="employer-candidate-links">
                      {links.map((l) => (
                        <a key={l.key} className="underline" href={l.href} target="_blank" rel="noreferrer noopener">{l.label}</a>
                      ))}
                    </div>
                  ) : (
                    <div>—</div>
                  )}
                </div>
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
                {academics.length ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Academics</div>
                    <ul className="space-y-2 border-l pl-3">
                      {academics.map((row, idx) => (
                        <li key={`${row.row_label}-${idx}`} className="space-y-0.5">
                          <div className="font-medium">
                            {[row.degree, row.specialization].filter(Boolean).join(' · ') || row.row_label || 'Academic record'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[
                              row.row_label && (row.degree || row.specialization) ? row.row_label : null,
                              row.college,
                              row.study_status,
                              row.graduation_year ? `Graduation ${row.graduation_year}` : null,
                              row.cgpa !== '' && row.cgpa != null ? `CGPA ${row.cgpa}` : null,
                            ].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </li>
                      ))}
                    </ul>
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
                <p className="text-xs text-muted-foreground">
                  {c.contact_gated
                    ? 'Email, CV, offers and endorsements appear once this candidate applies to your company. Phone follows the candidate’s shortlist setting.'
                    : 'Same details as “Download Excel + CV”. Phone follows the candidate’s shortlist setting.'}
                </p>
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
                    <Badge variant="outline">{toTitleCaseLabel(a.status) || a.status}</Badge>
                    <div>Match {matchLabel(a.match_score) || '—'}</div>
                    {a.created_at ? <div className="text-muted-foreground">Applied {formatDay(a.created_at)}</div> : null}
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
              {companyApps.length > 1 ? (
                <Card data-testid="employer-candidate-applications">
                  <CardHeader><CardTitle className="text-base">All applications to your company</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {companyApps.map((row, idx) => (
                        <li key={`${row.title}-${row.created_at}-${idx}`}>
                          <div className="font-medium">{row.title || 'Internship'}</div>
                          <div className="text-xs text-muted-foreground">
                            {[
                              toTitleCaseLabel(row.status) || row.status,
                              matchLabel(row.match_score) ? `Match ${matchLabel(row.match_score)}` : null,
                              row.created_at ? `Applied ${formatDay(row.created_at)}` : null,
                            ].filter(Boolean).join(' · ')}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
              {a ? (
                <Card data-testid="employer-candidate-offers">
                  <CardHeader><CardTitle className="text-base">Offers from your company</CardTitle></CardHeader>
                  <CardContent>
                    {offers.length ? (
                      <ul className="space-y-2 text-sm">
                        {offers.map((row, idx) => (
                          <li key={`${row.role_title}-${idx}`}>
                            <div className="font-medium">{row.role_title || row.title || 'Offer'}</div>
                            <div className="text-xs text-muted-foreground">
                              {[
                                toTitleCaseLabel(row.status) || row.status,
                                row.stipend_inr !== '' && row.stipend_inr != null ? `₹${Number(row.stipend_inr).toLocaleString('en-IN')}/mo` : null,
                                row.start_date ? `Starts ${formatDay(row.start_date)}` : null,
                              ].filter(Boolean).join(' · ')}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-sm text-muted-foreground">No offers yet</div>}
                  </CardContent>
                </Card>
              ) : null}
              {a ? (
                <Card data-testid="employer-candidate-endorsements">
                  <CardHeader><CardTitle className="text-base">Endorsements</CardTitle></CardHeader>
                  <CardContent>
                    {endorsements.length ? (
                      <ul className="space-y-2 text-sm">
                        {endorsements.map((row, idx) => (
                          <li key={`${row.company_name}-${row.created_at}-${idx}`}>
                            <div className="font-medium">
                              {[row.role_title, row.company_name].filter(Boolean).join(' · ') || 'Endorsement'}
                            </div>
                            {row.period_label ? <div className="text-xs text-muted-foreground">{row.period_label}</div> : null}
                            {row.skills_endorsed ? <div className="text-xs">Skills: {row.skills_endorsed}</div> : null}
                            {row.rating_excerpt ? <p className="text-xs text-muted-foreground whitespace-pre-line">{row.rating_excerpt}</p> : null}
                          </li>
                        ))}
                      </ul>
                    ) : <div className="text-sm text-muted-foreground">No endorsements yet</div>}
                  </CardContent>
                </Card>
              ) : null}
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
                        <li key={ev.id}>
                          {new Date(ev.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          {' — '}
                          {toTitleCaseLabel(ev.event_type) || ev.event_type}
                        </li>
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
