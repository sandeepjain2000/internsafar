'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/ip/PageHeader';
import IpTablePagination from '@/components/ip/IpTablePagination';
import { useClientPagination } from '@/hooks/useClientPagination';
import { StandardTableIconAction } from '@/components/ui/StandardTableIconAction';

const PAGE_SIZE = 10;

const STATUS_OPTIONS = ['applied', 'shortlisted', 'interviewing', 'rejected', 'hired', 'completed'];
const STATUS_VARIANT = {
  applied: 'outline', shortlisted: 'default', interviewing: 'default', hired: 'default',
  rejected: 'destructive', offered: 'default', completed: 'default',
};
const STATUS_ACTIONS = {
  applied: 'restore',
  shortlisted: 'shortlist',
  interviewing: 'review',
  rejected: 'reject',
  hired: 'select',
};

export default function ApplicantsPipelinePage() {
  const { id } = useParams();
  const [internship, setInternship] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const { page, setPage, totalPages, total, pageItems, serialOffset } = useClientPagination(applicants, PAGE_SIZE);
  const [offerFor, setOfferFor] = useState(null);
  const [offerForm, setOfferForm] = useState({
    roleTitle: '', stipendInr: '', startDate: '', validUntil: '', letterUrl: '', message: '',
    endDate: '', onboardingInstructions: '', mentorName: '', hrContactEmail: '', hrContactPhone: '',
  });
  const [interviewFor, setInterviewFor] = useState(null);
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewMeetUrl, setInterviewMeetUrl] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatusFilter] = useState('');
  const [minMatch, setMinMatch] = useState('');

  async function load() {
    const int = await fetch(`/api/ip/employer/internships/${id}`).then((r) => r.json());
    setInternship(int.internship);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (minMatch) params.set('minMatch', minMatch);
    const apps = await fetch(`/api/ip/employer/internships/${id}/applicants?${params}`).then((r) => r.json());
    setApplicants(apps.items || []);
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(appId, next) {
    if (next === 'interviewing') {
      const row = applicants.find((a) => a.id === appId);
      setInterviewFor(row || { id: appId, name: 'candidate' });
      const base = row?.interview_at ? new Date(row.interview_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
      const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setInterviewAt(local);
      setInterviewMeetUrl(row?.interview_meet_url || '');
      return;
    }
    await fetch(`/api/ip/employer/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await load();
  }

  async function saveInterview() {
    if (!interviewFor?.id || !interviewAt) return;
    const res = await fetch(`/api/ip/employer/applications/${interviewFor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'interviewing',
        interviewAt: new Date(interviewAt).toISOString(),
        interviewMeetUrl: interviewMeetUrl.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || 'Could not schedule interview');
      return;
    }
    setInterviewFor(null);
    setInterviewAt('');
    setInterviewMeetUrl('');
    await load();
  }

  async function markComplete(appId) {
    await fetch('/api/ip/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: appId }),
    });
    await load();
  }

  function openOffer(a) {
    setOfferFor(a);
    setOfferForm({
      roleTitle: internship?.title || '',
      stipendInr: internship?.stipend_inr || '',
      startDate: internship?.start_date ? String(internship.start_date).slice(0, 10) : '',
      validUntil: '',
      letterUrl: '',
      message: '',
      endDate: internship?.end_date ? String(internship.end_date).slice(0, 10) : '',
      onboardingInstructions: '',
      mentorName: '',
      hrContactEmail: '',
      hrContactPhone: '',
    });
  }

  async function sendOffer() {
    await fetch('/api/ip/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: offerFor.id, ...offerForm, stipendInr: offerForm.stipendInr ? Number(offerForm.stipendInr) : null }),
    });
    setOfferFor(null);
    await load();
  }

  if (!internship) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <PageHeader
        title={internship.title}
        description={`${applicants.length} applicant(s)`}
      />
      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-4">
          <Input placeholder="Search name/college" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <select className="h-9 rounded-md border px-2 text-sm" value={status} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.concat('offered').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input placeholder="Min match %" type="number" value={minMatch} onChange={(e) => setMinMatch(e.target.value)} className="max-w-[120px]" />
          <Button size="sm" onClick={load}>Filter</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Applicants</CardTitle><CardDescription>Sorted by match score</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[3rem]">#</TableHead>
                <TableHead>Candidate</TableHead><TableHead>College</TableHead><TableHead>Match</TableHead>
                <TableHead>Answers</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((a, idx) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground">{serialOffset + idx + 1}</TableCell>
                  <TableCell className="font-medium">
                    {a.name}
                    <div className="text-xs text-muted-foreground">{a.skills?.join(', ')}</div>
                    {a.preferred_hours_start && a.preferred_hours_end ? (
                      <div className="text-xs text-muted-foreground">Hours {a.preferred_hours_start}–{a.preferred_hours_end}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{a.college}<div className="text-xs text-muted-foreground">{a.degree}</div></TableCell>
                  <TableCell>{a.match_score != null ? `${a.match_score}%` : '—'}</TableCell>
                  <TableCell className="max-w-[200px] text-xs text-muted-foreground">
                    {a.answers && Object.keys(a.answers).length
                      ? Object.entries(a.answers).map(([k, v]) => <div key={k}><strong>{k}:</strong> {String(v)}</div>)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status] || 'outline'}>{a.status}</Badge>
                    {a.interview_at ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        Interview {new Date(a.interview_at).toLocaleString()}
                      </div>
                    ) : null}
                    {a.phone ? (
                      <div className="text-xs text-muted-foreground mt-1">Phone {a.phone}</div>
                    ) : a.phone_hidden ? (
                      <div className="text-xs text-muted-foreground mt-1">Phone hidden until interview/offer</div>
                    ) : null}
                    {a.immediate_start || a.willing_to_relocate ? (
                      <div className="text-xs text-muted-foreground mt-1">
                        {[a.immediate_start ? 'Immediate start' : null, a.willing_to_relocate ? 'Open to relocate' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {STATUS_OPTIONS.filter((s) => s !== a.status && s !== 'completed').map((s) => (
                      <StandardTableIconAction
                        key={s}
                        action={STATUS_ACTIONS[s] || 'edit'}
                        tooltip={`Move to ${s}`}
                        onClick={() => setStatus(a.id, s)}
                      />
                    ))}
                    {a.status === 'hired' || a.status === 'offered' ? (
                      <StandardTableIconAction action="complete" onClick={() => markComplete(a.id)} />
                    ) : null}
                    <StandardTableIconAction action="offer" onClick={() => openOffer(a)} />
                    <Dialog open={offerFor?.id === a.id} onOpenChange={(open) => !open && setOfferFor(null)}>
                      <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader><DialogTitle>Send offer to {a.name}</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <Field><FieldLabel>Role title</FieldLabel><Input value={offerForm.roleTitle} onChange={(e) => setOfferForm((f) => ({ ...f, roleTitle: e.target.value }))} /></Field>
                          <Field><FieldLabel>Stipend (INR/mo)</FieldLabel><Input type="number" value={offerForm.stipendInr} onChange={(e) => setOfferForm((f) => ({ ...f, stipendInr: e.target.value }))} /></Field>
                          <Field><FieldLabel>Start date</FieldLabel><Input type="date" value={offerForm.startDate} onChange={(e) => setOfferForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
                          <Field><FieldLabel>End date</FieldLabel><Input type="date" value={offerForm.endDate} onChange={(e) => setOfferForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
                          <Field><FieldLabel>Valid until</FieldLabel><Input type="date" value={offerForm.validUntil} onChange={(e) => setOfferForm((f) => ({ ...f, validUntil: e.target.value }))} /></Field>
                          <Field><FieldLabel>Offer letter URL</FieldLabel><Input value={offerForm.letterUrl} onChange={(e) => setOfferForm((f) => ({ ...f, letterUrl: e.target.value }))} placeholder="https://…" /></Field>
                          <Field><FieldLabel>Message to candidate</FieldLabel><Textarea rows={3} value={offerForm.message} onChange={(e) => setOfferForm((f) => ({ ...f, message: e.target.value }))} /></Field>
                          <Field><FieldLabel>Onboarding instructions</FieldLabel><Textarea rows={2} value={offerForm.onboardingInstructions} onChange={(e) => setOfferForm((f) => ({ ...f, onboardingInstructions: e.target.value }))} placeholder="First-day time, location, documents…" /></Field>
                          <Field><FieldLabel>Assigned mentor / tech lead</FieldLabel><Input value={offerForm.mentorName} onChange={(e) => setOfferForm((f) => ({ ...f, mentorName: e.target.value }))} /></Field>
                          <Field><FieldLabel>HR contact email</FieldLabel><Input type="email" value={offerForm.hrContactEmail} onChange={(e) => setOfferForm((f) => ({ ...f, hrContactEmail: e.target.value }))} placeholder="Uses company email if blank" /></Field>
                          <Field><FieldLabel>HR contact phone</FieldLabel><Input value={offerForm.hrContactPhone} onChange={(e) => setOfferForm((f) => ({ ...f, hrContactPhone: e.target.value }))} placeholder="Uses company phone if blank" /></Field>
                        </div>
                        <DialogFooter>
                          <Button onClick={sendOffer}>Send offer</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {!applicants.length ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No applicants yet.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
          <IpTablePagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </CardContent>
      </Card>

      <Dialog open={Boolean(interviewFor)} onOpenChange={(open) => !open && setInterviewFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview{interviewFor?.name ? ` — ${interviewFor.name}` : ''}</DialogTitle>
          </DialogHeader>
          <Field>
            <FieldLabel>Interview date and time</FieldLabel>
            <Input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Meeting link (optional)</FieldLabel>
            <Input
              type="url"
              value={interviewMeetUrl}
              onChange={(e) => setInterviewMeetUrl(e.target.value)}
              placeholder="https://meet.google.com/…"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Paste a real Google Meet, Zoom, or Teams URL. Candidates can join only if this is saved — the app will not invent a link.
            </p>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInterviewFor(null); setInterviewMeetUrl(''); }}>Cancel</Button>
            <Button onClick={saveInterview} disabled={!interviewAt}>Save &amp; notify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
