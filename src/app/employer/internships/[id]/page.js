'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import PageHeader from '@/components/ip/PageHeader';
import { StandardTableIconAction } from '@/components/ui/StandardTableIconAction';

const STATUS_OPTIONS = ['applied', 'shortlisted', 'interviewing', 'rejected', 'hired', 'completed'];
const STATUS_VARIANT = {
  applied: 'outline', shortlisted: 'default', interviewing: 'default', hired: 'default',
  rejected: 'destructive', offered: 'default', completed: 'default',
};
const STATUS_ACTIONS = {
  applied: 'restore', shortlisted: 'shortlist', interviewing: 'review',
  rejected: 'reject', hired: 'select',
};

const DEFAULT_FILTERS = {
  status: '',
  q: '',
  minMatch: '',
  screeningDisabled: '',
  listId: '',
  unread: false,
  responded: '',
  messageSent: '',
  mcqQuestionId: '',
  mcqAnswer: '',
  minHistTotal: '',
  minHistCompleted: '',
  minHistOngoing: '',
};

export default function ApplicantsPipelinePage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const [internship, setInternship] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [total, setTotal] = useState(0);
  const [capacity, setCapacity] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [lists, setLists] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selected, setSelected] = useState(() => new Set());
  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem(`ip_applicant_filters_${id}`);
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return {
      ...DEFAULT_FILTERS,
      status: searchParams.get('status') || '',
      unread: searchParams.get('unread') === '1',
    };
  });
  const [drawer, setDrawer] = useState(null);
  const [notes, setNotes] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [bulkMsg, setBulkMsg] = useState('');
  const [bulkMsgOpen, setBulkMsgOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTemplateId, setRejectTemplateId] = useState('');
  const [rejectWithMessage, setRejectWithMessage] = useState(true);
  const [compareIds, setCompareIds] = useState([]);
  const [offerFor, setOfferFor] = useState(null);
  const [offerForm, setOfferForm] = useState({
    roleTitle: '', stipendInr: '', startDate: '', validUntil: '', letterUrl: '', message: '',
    endDate: '', onboardingInstructions: '', mentorName: '', hrContactEmail: '', hrContactPhone: '',
  });
  const [interviewFor, setInterviewFor] = useState(null);
  const [interviewAt, setInterviewAt] = useState('');
  const [interviewMeetUrl, setInterviewMeetUrl] = useState('');
  const [newListName, setNewListName] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [mcqSummary, setMcqSummary] = useState([]);
  const [reminderNote, setReminderNote] = useState('');
  const [reminderAt, setReminderAt] = useState('');

  const loadMeta = useCallback(async () => {
    const [int, ls, tpls] = await Promise.all([
      fetch(`/api/ip/employer/internships/${id}`).then((r) => r.json()),
      fetch('/api/ip/employer/lists').then((r) => r.json()),
      fetch('/api/ip/employer/rejection-templates').then((r) => r.json()),
    ]);
    setInternship(int.internship);
    setLists(ls.items || []);
    setTemplates(tpls.items || []);
    if (tpls.items?.[0]) setRejectTemplateId(tpls.items[0].id);
  }, [id]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.status) params.set('status', filters.status);
    if (filters.minMatch) params.set('minMatch', filters.minMatch);
    if (filters.screeningDisabled) params.set('screeningDisabled', filters.screeningDisabled);
    if (filters.listId) params.set('listId', filters.listId);
    if (filters.unread) params.set('unread', '1');
    if (filters.responded !== '') params.set('responded', filters.responded);
    if (filters.messageSent) params.set('messageSent', filters.messageSent);
    if (filters.mcqQuestionId && filters.mcqAnswer) {
      params.set('mcqQuestionId', filters.mcqQuestionId);
      params.set('mcqAnswer', filters.mcqAnswer);
    }
    if (filters.minHistTotal) params.set('minHistTotal', filters.minHistTotal);
    if (filters.minHistCompleted) params.set('minHistCompleted', filters.minHistCompleted);
    if (filters.minHistOngoing) params.set('minHistOngoing', filters.minHistOngoing);
    params.set('mcqSummary', '1');
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    const apps = await fetch(`/api/ip/employer/internships/${id}/applicants?${params}`).then((r) => r.json());
    setApplicants(apps.items || []);
    setTotal(apps.total || 0);
    setCapacity(apps.capacity || null);
    setQuestions(apps.questions || []);
    setMcqSummary(apps.mcqSummary || []);
    try {
      localStorage.setItem(`ip_applicant_filters_${id}`, JSON.stringify(filters));
    } catch { /* ignore */ }
  }, [id, filters, page]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { load(); }, [load]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (filters.status) chips.push({ key: 'status', label: `Status: ${filters.status}` });
    if (filters.q) chips.push({ key: 'q', label: `Search: ${filters.q}` });
    if (filters.minMatch) chips.push({ key: 'minMatch', label: `Match ≥ ${filters.minMatch}%` });
    if (filters.screeningDisabled === '1') chips.push({ key: 'screeningDisabled', label: 'Greyed-out only' });
    if (filters.unread) chips.push({ key: 'unread', label: 'Unread' });
    if (filters.responded === '0') chips.push({ key: 'responded', label: 'Unresponded' });
    if (filters.responded === '1') chips.push({ key: 'responded', label: 'Responded' });
    if (filters.listId) {
      const l = lists.find((x) => x.id === filters.listId);
      chips.push({ key: 'listId', label: `List: ${l?.name || filters.listId}` });
    }
    return chips;
  }, [filters, lists]);

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS });
    setPage(1);
    try { localStorage.removeItem(`ip_applicant_filters_${id}`); } catch { /* ignore */ }
  }

  function toggleSelect(appId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === applicants.length) setSelected(new Set());
    else setSelected(new Set(applicants.map((a) => a.id)));
  }

  async function bulk(action, extra = {}) {
    const applicationIds = [...selected];
    if (!applicationIds.length) return;
    if (action === 'reject' && !window.confirm(`Reject ${applicationIds.length} application(s)?`)) return;
    const res = await fetch(`/api/ip/employer/internships/${id}/applicants/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, applicationIds, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || 'Bulk action failed');
      return;
    }
    setBulkResult(data);
    setSelected(new Set());
    setBulkMsgOpen(false);
    setRejectOpen(false);
    await load();
  }

  async function setStatus(appId, next) {
    if (next === 'interviewing') {
      const row = applicants.find((a) => a.id === appId);
      setInterviewFor(row || { id: appId, name: 'candidate' });
      const base = row?.interview_at ? new Date(row.interview_at) : new Date(Date.now() + 86400000);
      const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
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
    await load();
  }

  async function openDrawer(a) {
    setDrawer(a);
    const [n, t] = await Promise.all([
      fetch(`/api/ip/employer/applications/${a.id}/notes`).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/ip/employer/applications/${a.id}/events`).then((r) => r.json()).catch(() => ({ items: [] })),
    ]);
    setNotes(n.items || []);
    setTimeline(t.items || []);
  }

  async function addNote(body) {
    if (!drawer || !body.trim()) return;
    await fetch(`/api/ip/employer/applications/${drawer.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const n = await fetch(`/api/ip/employer/applications/${drawer.id}/notes`).then((r) => r.json());
    setNotes(n.items || []);
  }

  async function createList() {
    if (!newListName.trim()) return;
    const res = await fetch('/api/ip/employer/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error || 'Could not create list');
      return;
    }
    setNewListName('');
    await loadMeta();
  }

  async function saveReminder() {
    if (!drawer || !reminderAt) return;
    await fetch('/api/ip/employer/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: drawer.id,
        internshipId: id,
        remindAt: new Date(reminderAt).toISOString(),
        note: reminderNote,
      }),
    });
    setReminderAt('');
    setReminderNote('');
    window.alert('Reminder saved');
  }

  function openOffer(a) {
    setOfferFor(a);
    setOfferForm({
      roleTitle: internship?.title || '',
      stipendInr: internship?.stipend_inr || '',
      startDate: internship?.start_date ? String(internship.start_date).slice(0, 10) : '',
      validUntil: '', letterUrl: '', message: '',
      endDate: internship?.end_date ? String(internship.end_date).slice(0, 10) : '',
      onboardingInstructions: '', mentorName: '', hrContactEmail: '', hrContactPhone: '',
    });
  }

  async function sendOffer() {
    await fetch('/api/ip/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: offerFor.id, ...offerForm,
        stipendInr: offerForm.stipendInr ? Number(offerForm.stipendInr) : null,
      }),
    });
    setOfferFor(null);
    await load();
  }

  const personalizedPreview = useMemo(() => {
    const first = applicants.find((a) => selected.has(a.id));
    if (!first || !bulkMsg) return '';
    const firstName = String(first.name || '').split(/\s+/)[0] || 'there';
    return bulkMsg
      .replace(/\{\{\s*candidate_first_name\s*\}\}/gi, firstName)
      .replace(/\{\{\s*candidate_name\s*\}\}/gi, first.name || firstName)
      .replace(/\{\{\s*internship_title\s*\}\}/gi, internship?.title || '');
  }, [bulkMsg, selected, applicants, internship]);

  const compareRows = applicants.filter((a) => compareIds.includes(a.id));

  if (!internship) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title={internship.title}
        description={`${total} result(s) · ${capacity ? `${capacity.active}/${capacity.max} active · ${capacity.historical} historical` : ''} · ${internship.lifecycle_label || ''}`}
      />

      {internship.status === 'closed' ? (
        <ClosureSummary internshipId={id} capacity={capacity} />
      ) : null}

      <Card>
        <CardContent className="flex flex-wrap gap-2 pt-4 items-end">
          <Input placeholder="Search name/college" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} className="max-w-xs" />
          <select className="h-9 rounded-md border px-2 text-sm" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.concat('offered').map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input placeholder="Min match %" type="number" value={filters.minMatch} onChange={(e) => setFilters((f) => ({ ...f, minMatch: e.target.value }))} className="max-w-[120px]" />
          <select className="h-9 rounded-md border px-2 text-sm" value={filters.screeningDisabled} onChange={(e) => setFilters((f) => ({ ...f, screeningDisabled: e.target.value }))}>
            <option value="">All screening</option>
            <option value="1">Greyed-out / disabled</option>
            <option value="0">Not disabled</option>
          </select>
          <select className="h-9 rounded-md border px-2 text-sm" value={filters.listId} onChange={(e) => setFilters((f) => ({ ...f, listId: e.target.value }))}>
            <option value="">All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={filters.unread} onChange={(e) => setFilters((f) => ({ ...f, unread: e.target.checked }))} /> Unread</label>
          <select className="h-9 rounded-md border px-2 text-sm" value={filters.responded} onChange={(e) => setFilters((f) => ({ ...f, responded: e.target.value }))}>
            <option value="">Responded: any</option>
            <option value="0">Unresponded</option>
            <option value="1">Responded</option>
          </select>
          <select className="h-9 rounded-md border px-2 text-sm" value={filters.mcqQuestionId} onChange={(e) => setFilters((f) => ({ ...f, mcqQuestionId: e.target.value, mcqAnswer: '' }))}>
            <option value="">MCQ filter</option>
            {(questions || []).filter((q) => q.type === 'mcq' || q.options).map((q) => (
              <option key={q.id} value={q.id}>{q.prompt}</option>
            ))}
          </select>
          {filters.mcqQuestionId ? (
            <select className="h-9 rounded-md border px-2 text-sm" value={filters.mcqAnswer} onChange={(e) => setFilters((f) => ({ ...f, mcqAnswer: e.target.value }))}>
              <option value="">Any answer</option>
              {(questions.find((q) => q.id === filters.mcqQuestionId)?.options || []).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          ) : null}
          <Input className="max-w-[110px]" type="number" min={0} placeholder="Min total internships" value={filters.minHistTotal} onChange={(e) => setFilters((f) => ({ ...f, minHistTotal: e.target.value }))} title="Min total internships" />
          <Input className="max-w-[110px]" type="number" min={0} placeholder="Min completed" value={filters.minHistCompleted} onChange={(e) => setFilters((f) => ({ ...f, minHistCompleted: e.target.value }))} title="Min completed internships" />
          <Input className="max-w-[110px]" type="number" min={0} placeholder="Min ongoing" value={filters.minHistOngoing} onChange={(e) => setFilters((f) => ({ ...f, minHistOngoing: e.target.value }))} title="Min ongoing internships" />
          <Button size="sm" onClick={() => { setPage(1); load(); }}>Apply filters</Button>
          <Button size="sm" variant="outline" onClick={clearFilters}>Reset</Button>
        </CardContent>
      </Card>

      {mcqSummary?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MCQ response summary</CardTitle>
            <CardDescription>Option selected, count and percentage across all applications on this posting</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {mcqSummary.map((q) => (
              <div key={q.questionId} className="border rounded-md p-3 text-sm space-y-1">
                <div className="font-medium">{q.prompt}</div>
                <div className="text-xs text-muted-foreground">{q.answered} answered · {q.skipped} skipped</div>
                <ul className="text-xs space-y-0.5">
                  {q.options.map((o) => (
                    <li key={o.id}>
                      {o.label}: <strong>{o.count}</strong> ({o.percent}%)
                      {o.disablesApplication ? ' · trigger' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {activeChips.length ? (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-muted-foreground">{total} results</span>
          {activeChips.map((c) => (
            <Badge key={c.key} variant="secondary">{c.label}</Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{total} results</p>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Applicants</CardTitle>
            <CardDescription>Greyed-out rows are screening-disabled (still inspectable). Unread / needs-response shown with text labels.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-[200px]" placeholder="New list name" value={newListName} onChange={(e) => setNewListName(e.target.value)} />
            <Button size="sm" variant="outline" onClick={createList}>Create list</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><input type="checkbox" aria-label="Select all" checked={applicants.length > 0 && selected.size === applicants.length} onChange={toggleSelectAll} /></TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>History</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Answers</TableHead>
                <TableHead>Comm</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicants.map((a) => (
                <TableRow
                  key={a.id}
                  className={a.screening_disabled ? 'opacity-60 bg-muted/40' : undefined}
                  data-screening-disabled={a.screening_disabled ? 'true' : 'false'}
                >
                  <TableCell>
                    <input type="checkbox" aria-label={`Select ${a.name}`} checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} />
                  </TableCell>
                  <TableCell className="font-medium">
                    <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => openDrawer(a)}>
                      {a.name}
                    </button>
                    {a.screening_disabled ? (
                      <div className="text-xs font-medium text-muted-foreground" role="status">
                        Screening disabled
                        {a.screening_disable_reason?.optionLabel
                          ? `: ${a.screening_disable_reason.prompt} → ${a.screening_disable_reason.optionLabel}`
                          : ''}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">{a.college} · {a.city || '—'}</div>
                    {a.list_names ? <div className="text-xs text-muted-foreground">Lists: {a.list_names}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.internship_history
                      ? `${a.internship_history.total_internships} total` +
                        (a.internship_history.completed_hidden
                          ? ' · completed hidden'
                          : ` · ${a.internship_history.completed_internships} done`) +
                        ` · ${a.internship_history.ongoing_internships} ongoing`
                      : '—'}
                  </TableCell>
                  <TableCell>{a.match_score != null ? `${a.match_score}%` : '—'}</TableCell>
                  <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                    {a.answers && Object.keys(a.answers).length
                      ? Object.entries(a.answers).map(([k, v]) => {
                          const snap = (a.questions_snapshot || questions || []).find((qq) => qq.id === k);
                          const label = snap?.options?.find((o) => o.id === v)?.label || v;
                          return <div key={k}><strong>{snap?.prompt || k}:</strong> {String(label)}</div>;
                        })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {a.communication?.unread ? <div role="status">Unread</div> : <div className="text-muted-foreground">Read</div>}
                    {a.communication?.unresponded ? <div role="status">Needs response</div> : <div className="text-muted-foreground">Responded</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[a.status] || 'outline'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {STATUS_OPTIONS.filter((s) => s !== a.status && s !== 'completed').map((s) => (
                      <StandardTableIconAction key={s} action={STATUS_ACTIONS[s] || 'edit'} tooltip={`Move to ${s}`} onClick={() => setStatus(a.id, s)} />
                    ))}
                    <StandardTableIconAction action="offer" onClick={() => openOffer(a)} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCompareIds((ids) => {
                        if (ids.includes(a.id)) return ids.filter((x) => x !== a.id);
                        if (ids.length >= 4) return ids;
                        return [...ids, a.id];
                      })}
                    >
                      {compareIds.includes(a.id) ? 'Uncompare' : 'Compare'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!applicants.length ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No applicants match filters.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="text-sm text-muted-foreground">Page {page} · {total} total</span>
            <Button size="sm" variant="outline" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>

      {compareRows.length >= 2 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Compare ({compareRows.length})</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {compareRows.map((a) => (
              <div key={a.id} className="border rounded-md p-3 text-sm space-y-1">
                <div className="font-medium">{a.name}</div>
                <div>{a.college}</div>
                <div>Match {a.match_score ?? '—'}%</div>
                <div>City {a.city || '—'}</div>
                <div>Skills {(a.skills || []).join(', ') || '—'}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {selected.size > 0 ? (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur p-3 shadow-lg">
          <div className="mx-auto max-w-6xl flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button size="sm" onClick={() => bulk('shortlist')}>Shortlist</Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>Reject…</Button>
            <Button size="sm" variant="secondary" onClick={() => setBulkMsgOpen(true)}>Message…</Button>
            <select
              className="h-8 rounded-md border px-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulk('add_to_list', { listId: e.target.value });
                e.target.value = '';
              }}
            >
              <option value="">Add to list…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={async () => {
              const includeResumes = window.confirm(
                'Include resumes in a ZIP (CSV + resumes)?\n\nOK = ZIP with resumes (may run as background job)\nCancel = CSV only',
              );
              const res = await fetch(`/api/ip/employer/internships/${id}/applicants/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'export',
                  applicationIds: [...selected],
                  includeResumes,
                  async: includeResumes || selected.size > 15,
                }),
              }).then((r) => r.json());
              if (res.error) {
                window.alert(res.error);
                return;
              }
              if (res.async && res.jobId) {
                setBulkResult({ ...res, exportPolling: true });
                let tries = 0;
                const poll = async () => {
                  tries += 1;
                  const j = await fetch(`/api/ip/employer/export-jobs/${res.jobId}`).then((r) => r.json());
                  const job = j.job;
                  if (!job) return;
                  setBulkResult({ jobId: res.jobId, job });
                  if (job.status === 'done') {
                    if (job.result_zip_base64) {
                      const bin = Uint8Array.from(atob(job.result_zip_base64), (c) => c.charCodeAt(0));
                      const blob = new Blob([bin], { type: 'application/zip' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = job.result_filename || 'applicants-export.zip';
                      a.click();
                      URL.revokeObjectURL(url);
                    } else if (job.result_csv) {
                      const blob = new Blob([job.result_csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = job.result_filename || 'applicants-export.csv';
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                    return;
                  }
                  if (job.status === 'failed') {
                    window.alert(job.error || 'Export failed');
                    return;
                  }
                  if (tries < 60) setTimeout(poll, 1500);
                };
                poll();
                return;
              }
              if (res.zipBase64) {
                const bin = Uint8Array.from(atob(res.zipBase64), (c) => c.charCodeAt(0));
                const blob = new Blob([bin], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = res.filename || 'applicants-export.zip';
                a.click();
                URL.revokeObjectURL(url);
              } else {
                const blob = new Blob([res.csv || ''], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = res.filename || 'applicants-export.csv';
                a.click();
                URL.revokeObjectURL(url);
              }
            }}>Export CSV/ZIP</Button>
          </div>
        </div>
      ) : null}

      <Dialog open={bulkMsgOpen} onOpenChange={setBulkMsgOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk message</DialogTitle></DialogHeader>
          <Alert>
            <AlertTitle>Personalized send</AlertTitle>
            <AlertDescription>
              Write the body only. Each message is personalized with the candidate&apos;s current name at send time.
              Use {'{{candidate_first_name}}'} and {'{{internship_title}}'} if desired.
            </AlertDescription>
          </Alert>
          <Textarea rows={5} value={bulkMsg} onChange={(e) => setBulkMsg(e.target.value)} placeholder="Hi {{candidate_first_name}}, …" />
          {personalizedPreview ? (
            <div className="text-sm border rounded-md p-2 bg-muted/30">
              <div className="font-medium mb-1">Preview (first selected)</div>
              <pre className="whitespace-pre-wrap text-xs">{personalizedPreview}</pre>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => bulk('message', { body: bulkMsg })}>Send to {selected.size}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk reject</DialogTitle></DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rejectWithMessage} onChange={(e) => setRejectWithMessage(e.target.checked)} />
            Also send rejection message
          </label>
          {rejectWithMessage ? (
            <select className="h-9 w-full rounded-md border px-2 text-sm" value={rejectTemplateId} onChange={(e) => setRejectTemplateId(e.target.value)}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_system ? ' (system)' : ''}</option>)}
            </select>
          ) : null}
          <DialogFooter>
            <Button variant="destructive" onClick={() => bulk('reject', {
              sendMessage: rejectWithMessage,
              templateId: rejectTemplateId,
            })}>
              Confirm reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(drawer)} onOpenChange={(open) => !open && setDrawer(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader><DialogTitle>{drawer?.name}</DialogTitle></DialogHeader>
          {drawer ? (
            <div className="space-y-3 text-sm">
              <div>{drawer.college} · {drawer.degree}</div>
              <div>Skills: {(drawer.skills || []).join(', ') || '—'}</div>
              <PrivateNotes notes={notes} onAdd={addNote} />
              <div>
                <div className="font-medium mb-1">Timeline</div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {timeline.map((ev) => (
                    <li key={ev.id}>{new Date(ev.created_at).toLocaleString()} — {ev.event_type}</li>
                  ))}
                  {!timeline.length ? <li>No events yet</li> : null}
                </ul>
              </div>
              <div className="space-y-2 border-t pt-2">
                <div className="font-medium">Follow-up reminder</div>
                <Input type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
                <Input placeholder="Note" value={reminderNote} onChange={(e) => setReminderNote(e.target.value)} />
                <Button size="sm" onClick={saveReminder}>Save reminder</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(interviewFor)} onOpenChange={(open) => !open && setInterviewFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule interview — {interviewFor?.name}</DialogTitle></DialogHeader>
          <Field><FieldLabel>When</FieldLabel><Input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} /></Field>
          <Field><FieldLabel>Meet URL</FieldLabel><Input value={interviewMeetUrl} onChange={(e) => setInterviewMeetUrl(e.target.value)} /></Field>
          <DialogFooter><Button onClick={saveInterview}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(offerFor)} onOpenChange={(open) => !open && setOfferFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send offer to {offerFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field><FieldLabel>Role title</FieldLabel><Input value={offerForm.roleTitle} onChange={(e) => setOfferForm((f) => ({ ...f, roleTitle: e.target.value }))} /></Field>
            <Field><FieldLabel>Stipend (INR/mo)</FieldLabel><Input type="number" value={offerForm.stipendInr} onChange={(e) => setOfferForm((f) => ({ ...f, stipendInr: e.target.value }))} /></Field>
            <Field><FieldLabel>Message</FieldLabel><Textarea rows={3} value={offerForm.message} onChange={(e) => setOfferForm((f) => ({ ...f, message: e.target.value }))} /></Field>
          </div>
          <DialogFooter><Button onClick={sendOffer}>Send offer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkResult?.exportPolling || bulkResult?.job?.status === 'processing' || bulkResult?.job?.status === 'pending' ? (
        <Alert className="fixed bottom-16 inset-x-4 z-40 max-w-md mx-auto shadow-lg">
          <AlertTitle>Export in progress</AlertTitle>
          <AlertDescription>
            {bulkResult?.job
              ? `Status: ${bulkResult.job.status} (${bulkResult.job.progress ?? 0}/${bulkResult.job.total ?? '?'}). Download starts when ready.`
              : 'Building CSV/ZIP in the background…'}
          </AlertDescription>
        </Alert>
      ) : null}

      {bulkResult?.failed > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Bulk message partial failure</AlertTitle>
          <AlertDescription>
            Sent {bulkResult.success}, failed {bulkResult.failed}.{' '}
            <Button size="sm" variant="outline" onClick={() => bulk('retry_failed_messages', { jobId: bulkResult.jobId })}>
              Retry failures
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function PrivateNotes({ notes, onAdd }) {
  const [text, setText] = useState('');
  return (
    <div>
      <div className="font-medium mb-1">Private notes (employer only)</div>
      <ul className="space-y-1 text-xs mb-2">
        {notes.map((n) => (
          <li key={n.id} className="border rounded p-1">{n.body}</li>
        ))}
        {!notes.length ? <li className="text-muted-foreground">No notes</li> : null}
      </ul>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add note…" />
      <Button size="sm" className="mt-1" onClick={() => { onAdd(text); setText(''); }}>Add note</Button>
    </div>
  );
}

function ClosureSummary({ internshipId, capacity }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    fetch(`/api/ip/employer/internships/${internshipId}/closure-summary`)
      .then((r) => r.json())
      .then((d) => setSummary(d.summary))
      .catch(() => {});
  }, [internshipId]);
  if (!summary && !capacity) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Post-closure hiring summary</CardTitle>
      </CardHeader>
      <CardContent className="text-sm flex flex-wrap gap-4">
        <span>Historical apps: {summary?.historical ?? capacity?.historical ?? '—'}</span>
        <span>Hired: {summary?.hired ?? '—'}</span>
        <span>Rejected: {summary?.rejected ?? '—'}</span>
        <span>Interviewed: {summary?.interviewed ?? '—'}</span>
      </CardContent>
    </Card>
  );
}
