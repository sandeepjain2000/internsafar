'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/ip/PageHeader';

export default function EmployerCandidateProfilePage() {
  const { id } = useParams();
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

  const c = data?.candidate;
  const a = data?.application;
  const hist = c?.internship_history;

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title={c?.name || 'Candidate'}
        description="Employer-visible profile (contact details stay hidden until the workflow allows them)."
        actions={(
          <Button variant="outline" size="sm" asChild>
            <Link href={from.startsWith('/') ? from : '/employer/candidates'}>Back to list</Link>
          </Button>
        )}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!c && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {c ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Profile</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {c.profile_picture_url ? (
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
                <div><dt className="text-xs text-muted-foreground">Experience</dt><dd>{c.prior_experience || '—'}</dd></div>
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
                <div>{Array.isArray(c.skills) && c.skills.length ? c.skills.join(', ') : '—'}</div>
              </div>
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
  );
}
