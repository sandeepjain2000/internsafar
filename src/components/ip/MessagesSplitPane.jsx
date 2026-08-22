'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Archive, Calendar, FileText, MessageSquare, Paperclip, Search, Send } from 'lucide-react';
import { isStoredMeetUrl, meetJoinLabel } from '@/lib/ipInterviewMeetUrl';
import {
  formatBytes,
  formatDurationMonths,
  formatStipendInr,
} from '@/lib/ipMessagePresentation';
import '@/components/ip/ip-employer-messages-gemini.css';
import '@/components/ip/ip-candidate-messages-gemini.css';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatWhen(value) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatBubbleTime(value) {
  if (!value) return '';
  const d = new Date(value);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function counterpartName(t, role) {
  if (role === 'employer') return t.candidate_name || 'Candidate';
  return t.company_name || t.employer_name || 'Employer';
}

function roleLine(t) {
  if (t.internship_title) return t.internship_title;
  if (t.candidate_specialization) return t.candidate_specialization;
  if (t.candidate_degree) return t.candidate_degree;
  return t.subject || 'Conversation';
}

function ThreadPartyPanel({ role, thread }) {
  if (!thread) {
    return (
      <aside className="ip-msg-party">
        <h3>{role === 'candidate' ? 'Employer in this thread' : 'Candidate in this thread'}</h3>
        <p>Select a conversation to see details for this thread only.</p>
      </aside>
    );
  }
  if (role === 'candidate') {
    const company = thread.company_name || thread.employer_name || 'Employer';
    return (
      <aside className="ip-msg-party">
        <h3>Employer in this thread</h3>
        <div className="ip-msg-party__card">
          <div className="ip-msg-party__av">{initials(company)}</div>
          <strong>{company}</strong>
          {String(thread.employer_approval_status || '').toLowerCase() === 'approved' || thread.employer_verified ? (
            <p>Verified employer</p>
          ) : (
            <p>Employer in this conversation</p>
          )}
        </div>
        <div className="ip-msg-party__sec">
          <span>Internship in this thread</span>
          <b>{thread.internship_title || 'General conversation'}</b>
        </div>
        <div className="ip-msg-party__sec">
          <span>Work details</span>
          <b>{[thread.internship_work_mode, thread.internship_location].filter(Boolean).join(' · ') || '—'}</b>
        </div>
        <div className="ip-msg-party__sec">
          <span>Stipend</span>
          <b>{thread.internship_stipend_inr ? `₹${Number(thread.internship_stipend_inr).toLocaleString('en-IN')}/mo` : '—'}</b>
        </div>
        <div className="ip-msg-party__sec">
          <span>Duration</span>
          <b>{formatDurationMonths(thread.internship_duration_months) || '—'}</b>
        </div>
        <div className="ip-msg-party__sec">
          <span>Your application</span>
          <b>{thread.application_status || 'No application on this thread'}</b>
        </div>
        {thread.offer_status ? (
          <div className="ip-msg-party__sec">
            <span>Offer</span>
            <b>{thread.offer_status}{thread.offer_role_title ? ` · ${thread.offer_role_title}` : ''}</b>
          </div>
        ) : null}
        {thread.internship_id ? (
          <Link className="ip-msg-party__link" href={`/candidate/internships/${thread.internship_id}`}>
            View internship
          </Link>
        ) : null}
      </aside>
    );
  }
  const name = thread.candidate_name || 'Candidate';
  return (
    <aside className="ip-msg-party">
      <h3>Candidate in this thread</h3>
      <div className="ip-msg-party__card">
        <div className="ip-msg-party__av">{initials(name)}</div>
        <strong>{name}</strong>
        <p>{[thread.candidate_degree, thread.candidate_specialization].filter(Boolean).join(' · ') || 'Candidate'}</p>
      </div>
      <div className="ip-msg-party__sec">
        <span>College</span>
        <b>{thread.candidate_college || '—'}</b>
      </div>
      <div className="ip-msg-party__sec">
        <span>CGPA</span>
        <b>{thread.candidate_cgpa != null ? thread.candidate_cgpa : '—'}</b>
      </div>
      <div className="ip-msg-party__sec">
        <span>Internship</span>
        <b>{thread.internship_title || '—'}</b>
      </div>
      <div className="ip-msg-party__sec">
        <span>Application</span>
        <b>{thread.application_status || '—'}</b>
      </div>
    </aside>
  );
}

function subtitleLine(t, role) {
  if (role === 'employer') {
    return t.candidate_college || null;
  }
  return t.employer_name && t.company_name && t.employer_name !== t.company_name
    ? t.employer_name
    : null;
}

function formatInterviewWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function meetViaLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'meet.google.com' || host.endsWith('.meet.google.com')) return 'via Google Meet';
    return `via ${host}`;
  } catch {
    return '';
  }
}

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIcsUtc(date) {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

function downloadInterviewIcs({ title, startIso, meetUrl, company }) {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const summary = title ? `Interview — ${title}` : 'Interview';
  const desc = meetUrl ? `Join: ${meetUrl}` : 'Interview scheduled on PlacementHub.';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlacementHub//Internship Portal//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:ip-interview-${start.getTime()}@placementhub`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(desc)}`,
    company ? `ORGANIZER:${escapeIcs(company)}` : null,
    meetUrl ? `URL:${meetUrl}` : null,
    meetUrl ? `LOCATION:${escapeIcs(meetUrl)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'interview.ics';
  a.click();
  URL.revokeObjectURL(href);
}

const ATTACH_ACCEPT =
  'application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif';

function roleMetaLine(t) {
  const stipend = formatStipendInr(t.internship_stipend_inr);
  const mode = t.internship_work_mode;
  if (stipend && mode) return `${roleLine(t)} • ${stipend} (${mode})`;
  if (stipend) return `${roleLine(t)} • ${stipend}`;
  if (mode) return `${roleLine(t)} • ${mode}`;
  return roleLine(t);
}

function offerSummary(t) {
  const bits = [
    formatStipendInr(t.offer_stipend_inr || t.internship_stipend_inr),
    formatDurationMonths(t.internship_duration_months),
    t.offer_start_date
      ? `Starts ${new Date(t.offer_start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : null,
  ].filter(Boolean);
  return bits.join(' • ');
}

/**
 * Split-pane inbox. Employer keeps existing chrome; candidate matches workspace HTML.
 */
export default function MessagesSplitPane({ role = 'employer' }) {
  const isEmployer = role === 'employer';
  const base = isEmployer ? '/employer/messages' : '/candidate/messages';
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadFromUrl = searchParams.get('thread') || '';
  const feedRef = useRef(null);
  const fileRef = useRef(null);

  const [threads, setThreads] = useState([]);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(threadFromUrl);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [inboxMeta, setInboxMeta] = useState({ unread: 0, action: 0 });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  const loadThreads = useCallback(async () => {
    setLoadingList(true);
    try {
      const qs = tab === 'archived' ? '?archived=1' : '';
      const res = await fetch(`/api/ip/messages/threads${qs}`);
      const data = await res.json();
      const items = data.items || [];
      setThreads(items);
      if (tab !== 'archived') {
        setInboxMeta({
          unread: items.filter((t) => Number(t.unread_count) > 0).length,
          action: items.filter((t) => t.needs_action).length,
        });
      }
    } catch {
      setThreads([]);
    } finally {
      setLoadingList(false);
    }
  }, [tab]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (threadFromUrl) setSelectedId(threadFromUrl);
  }, [threadFromUrl]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = threads.filter((t) => {
      if (tab === 'unreplied') {
        const last = t.last_sender_user_id;
        const me = role === 'candidate' ? t.candidate_user_id : t.employer_user_id;
        if (!last || last !== me) return false;
      }
      if (!q) return true;
      const hay = `${counterpartName(t, role)} ${t.internship_title || ''} ${t.subject || ''} ${t.last_message || ''} ${t.candidate_college || ''} ${t.employer_name || ''} ${t.company_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
    if (sort === 'oldest') {
      return [...rows].reverse();
    }
    return rows;
  }, [threads, search, tab, role, sort]);

  const loadThread = useCallback(
    async (id) => {
      if (!id) {
        setThread(null);
        setMessages([]);
        return;
      }
      setLoadingThread(true);
      setError('');
      try {
        const res = await fetch(`/api/ip/messages/threads/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Thread not found');
        setThread(data.thread);
        setMessages(data.messages || []);
        await loadThreads();
      } catch (e) {
        setError(e.message);
        setThread(null);
        setMessages([]);
      } finally {
        setLoadingThread(false);
      }
    },
    [loadThreads]
  );

  useEffect(() => {
    if (selectedId) loadThread(selectedId);
    else {
      setThread(null);
      setMessages([]);
    }
  }, [selectedId, loadThread]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, selectedId]);

  function selectThread(id) {
    setSelectedId(id);
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = '';
    router.replace(id ? `${base}?thread=${encodeURIComponent(id)}` : base, { scroll: false });
  }

  async function send(e) {
    e?.preventDefault?.();
    if (!selectedId || thread?.archived) return;
    const text = draft.trim();
    if (!text && !pendingFile) return;
    setSending(true);
    setError('');
    try {
      let attachment = null;
      if (pendingFile) {
        const fd = new FormData();
        fd.append('file', pendingFile);
        const up = await fetch(`/api/ip/messages/threads/${selectedId}/attachment`, {
          method: 'POST',
          body: fd,
        });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData.error || 'Upload failed');
        attachment = {
          url: upData.url,
          name: upData.name,
          size: upData.size,
          type: upData.type,
        };
      }
      const res = await fetch(`/api/ip/messages/threads/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, attachment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setDraft('');
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadThread(selectedId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function setArchived(id, archived) {
    try {
      const res = await fetch(`/api/ip/messages/threads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Archive failed');
      showToast(archived ? 'Conversation archived' : 'Conversation unarchived');
      if (id === selectedId) {
        selectThread('');
      }
      await loadThreads();
    } catch (err) {
      setError(err.message);
    }
  }

  function openResume() {
    const url = thread?.candidate_resume_url;
    if (url) {
      window.open(url, '_blank', 'noreferrer');
      return;
    }
    showToast('No resume on file for this candidate yet.');
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
  }

  const canSend = Boolean((draft.trim() || pendingFile) && !sending && !thread?.archived);
  const activeName = thread ? counterpartName(thread, role) : isEmployer ? 'candidate' : 'employer';
  const showInterview = !isEmployer && thread && String(thread.application_status || '').toLowerCase() === 'interviewing' && thread.interview_at;
  const showOffer = !isEmployer && thread && (String(thread.application_status || '').toLowerCase() === 'offered' || thread.offer_id);
  const meetUrl = isStoredMeetUrl(thread?.interview_meet_url) ? thread.interview_meet_url : '';

  const toastEl = toast ? <div className={isEmployer ? 'ip-em-toast' : 'ip-cm-toast'}>{toast}</div> : null;

  if (!isEmployer) {
    return (
      <div className="ip-cand-msg">
        {toastEl}
        <div className="ip-cm-banner">
          <h1>Employer Communications Inbox</h1>
          <p>Direct messaging hub for interview scheduling, technical screening, and offer discussions.</p>
        </div>
        <div className="ip-cm-policy">
          <div className="ip-cm-policy-icon" aria-hidden>i</div>
          <div>
            <strong>Messaging Workflow:</strong> Employers initiate direct communication after reviewing submitted applications. Candidates can reply to active employer threads below.
          </div>
        </div>

        <div className="ip-cm-split">
          <aside className="ip-cm-list">
            <div className="ip-cm-list-head">
              <div className="ip-cm-search">
                <Search aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employer or role..."
                  aria-label="Search conversations"
                />
              </div>
              <div className="ip-cm-tabs-row">
                <div className="ip-cm-tabs">
                  {[
                    ['all', 'All'],
                    ['unread', `Unread${inboxMeta.unread ? ` (${inboxMeta.unread})` : ''}`],
                    ['action', `Action Req.${inboxMeta.action ? ` (${inboxMeta.action})` : ''}`],
                    ['unreplied', 'Awaiting reply'],
                    ['archived', 'Archived'],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`ip-cm-tab${tab === key ? ' ip-cm-tab--on' : ''}`}
                      onClick={() => setTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <select
                  className="ip-cm-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  aria-label="Sort conversations"
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>
            <div className="ip-cm-list-body">
              {loadingList ? (
                <p className="ip-cm-empty-list">Loading…</p>
              ) : filtered.length ? (
                <table className="ip-msg-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>Internship</th>
                      <th>Preview</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const unread = Number(t.unread_count) > 0;
                      const on = t.id === selectedId;
                      const name = counterpartName(t, role);
                      return (
                        <tr
                          key={t.id}
                          className={on ? 'is-on' : undefined}
                          onClick={() => selectThread(t.id)}
                        >
                          <td>
                            <strong>{name}</strong>
                            {unread ? <span className="ip-cm-unread" aria-label="Unread" /> : null}
                          </td>
                          <td>{roleLine(t)}</td>
                          <td className="ip-msg-table__preview">{t.last_message || t.subject || '—'}</td>
                          <td>{formatWhen(t.last_message_at || t.updated_at)}</td>
                          <td>{t.application_status || (Number(t.message_count) ? 'Open' : 'New')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="ip-cm-empty-list">
                  <p style={{ fontWeight: 800, color: '#334155', margin: 0 }}>No conversations found</p>
                  <p style={{ margin: '0.35rem 0 0' }}>No messages match the current filter or search criteria.</p>
                </div>
              )}
            </div>
          </aside>

          <section className="ip-cm-thread">
            {!selectedId ? (
              <div className="ip-cm-thread-empty">Select a conversation to view details.</div>
            ) : loadingThread && !thread ? (
              <div className="ip-cm-thread-empty">Loading thread…</div>
            ) : !thread ? (
              <div className="ip-cm-thread-empty">{error || 'Thread not found.'}</div>
            ) : (
              <>
                <div className="ip-cm-thread-head">
                  <div className="ip-cm-thread-person">
                    <div className="ip-cm-avatar">{initials(counterpartName(thread, role))}</div>
                    <div>
                      <h3>
                        {counterpartName(thread, role)}
                        {thread.employer_verified ? (
                          <span className="ip-cm-verified-chip">Verified Recruiter</span>
                        ) : null}
                      </h3>
                      <p>{roleMetaLine(thread)}</p>
                    </div>
                  </div>
                  <div className="ip-cm-thread-actions">
                    <Link href="/candidate/applications" className="ip-cm-btn ip-cm-btn--ghost">
                      View Timeline
                    </Link>
                    <button
                      type="button"
                      className="ip-cm-btn ip-cm-btn--icon"
                      title={thread.archived ? 'Unarchive conversation' : 'Archive conversation'}
                      onClick={() => setArchived(thread.id, !thread.archived)}
                    >
                      <Archive className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>

                {showInterview ? (
                  <div className="ip-cm-interview">
                    <div>
                      <strong>
                        <Calendar className="size-4" aria-hidden />
                        Interview scheduled
                      </strong>
                      <p>
                        {formatInterviewWhen(thread.interview_at)}
                        {meetUrl ? ` ${meetViaLabel(meetUrl)}` : ''}
                      </p>
                    </div>
                    <div className="ip-cm-interview-actions">
                      {meetUrl ? (
                        <a
                          className="ip-cm-btn ip-cm-btn--meet"
                          href={meetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {meetJoinLabel(meetUrl)}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="ip-cm-btn ip-cm-btn--cal"
                        onClick={() =>
                          downloadInterviewIcs({
                            title: thread.internship_title,
                            startIso: thread.interview_at,
                            meetUrl,
                            company: counterpartName(thread, role),
                          })
                        }
                      >
                        Add to Calendar
                      </button>
                    </div>
                  </div>
                ) : null}

                {showOffer ? (
                  <div className="ip-cm-offer">
                    <div>
                      <strong>Formal offer letter extended</strong>
                      <p>{offerSummary(thread) || 'Review the offer in Offers.'}</p>
                    </div>
                    <Link href="/candidate/offers" className="ip-cm-btn ip-cm-btn--offer">
                      View Formal Offer →
                    </Link>
                  </div>
                ) : null}

                {error ? <div className="ip-cm-alert">{error}</div> : null}

                <div className="ip-cm-feed" ref={feedRef}>
                  {messages.map((m) => {
                    const mine =
                      m.sender_role === 'candidate' || m.sender_user_id === thread.candidate_user_id;
                    return (
                      <div
                        key={m.id}
                        className={`ip-cm-bubble-row ${mine ? 'ip-cm-bubble-row--me' : 'ip-cm-bubble-row--them'}`}
                      >
                        <span className="ip-cm-bubble-meta">
                          {m.sender_name} • {formatBubbleTime(m.sent_at)}
                        </span>
                        <div className={`ip-cm-bubble ${mine ? 'ip-cm-bubble--me' : 'ip-cm-bubble--them'}`}>
                          {m.body ? <p>{m.body}</p> : null}
                          {m.attachment_url ? (
                            <div className="ip-cm-file">
                              <Paperclip className="size-3.5" aria-hidden />
                              <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                                {m.attachment_name || 'Attachment'}
                              </a>
                              {m.attachment_size ? (
                                <span>({formatBytes(m.attachment_size)})</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {!messages.length ? (
                    <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                      No messages yet — reply below when the employer writes first.
                    </p>
                  ) : null}
                </div>

                {pendingFile && !thread.archived ? (
                  <div className="ip-cm-attach-bar">
                    <span>
                      <strong>{pendingFile.name}</strong>{' '}
                      <span style={{ color: '#94a3b8' }}>({formatBytes(pendingFile.size)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFile(null);
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : null}

                <form className="ip-cm-composer" onSubmit={send}>
                  {thread.archived ? (
                    <div className="ip-cm-archived">
                      This conversation is archived. Unarchive the thread to send messages.
                    </div>
                  ) : (
                    <div className="ip-cm-composer-row">
                      <input
                        ref={fileRef}
                        type="file"
                        accept={ATTACH_ACCEPT}
                        onChange={onPickFile}
                      />
                      <button
                        type="button"
                        className="ip-cm-attach"
                        title="Attach file"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Paperclip className="size-5" aria-hidden />
                      </button>
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Type reply message to recruiter..."
                        aria-label="Reply"
                      />
                      <button type="submit" className="ip-cm-btn ip-cm-btn--primary" disabled={!canSend}>
                        Send
                        <Send className="size-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </section>
          <ThreadPartyPanel role={role} thread={selectedId ? thread : null} />
        </div>
      </div>
    );
  }

  const bannerTitle = 'Candidate Communications Inbox';
  const bannerDesc =
    'Direct messaging hub for discussing interview availability, project briefs, and application updates.';

  return (
    <div className="ip-emp-msg">
      {toastEl}

      <div className="ip-em-banner">
        <div>
          <h1>{bannerTitle}</h1>
          <p>{bannerDesc}</p>
        </div>
        <div className="ip-em-count">
          <MessageSquare className="size-4" aria-hidden />
          <span>
            {threads.length} Active Conversation{threads.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="ip-em-split">
        <aside className="ip-em-list">
          <div className="ip-em-list-head">
            <div className="ip-em-search">
              <Search aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidates or roles..."
                aria-label="Search conversations"
              />
            </div>
            <div className="ip-em-tabs">
              <button
                type="button"
                className={`ip-em-tab${tab === 'all' ? ' ip-em-tab--on' : ''}`}
                onClick={() => setTab('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`ip-em-tab${tab === 'unread' ? ' ip-em-tab--on' : ''}`}
                onClick={() => setTab('unread')}
              >
                Unread ({inboxMeta.unread})
              </button>
              <button
                type="button"
                className={`ip-em-tab${tab === 'unreplied' ? ' ip-em-tab--on' : ''}`}
                onClick={() => setTab('unreplied')}
              >
                Awaiting reply
              </button>
            </div>
          </div>

          <div className="ip-em-list-body">
            {loadingList ? (
              <p className="ip-em-empty-list">Loading…</p>
            ) : filtered.length ? (
              <table className="ip-msg-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Internship</th>
                    <th>Preview</th>
                    <th>When</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const unread = Number(t.unread_count) > 0;
                    const on = t.id === selectedId;
                    const name = counterpartName(t, role);
                    return (
                      <tr
                        key={t.id}
                        className={on ? 'is-on' : undefined}
                        onClick={() => selectThread(t.id)}
                      >
                        <td>
                          <strong>{name}</strong>
                          {unread ? <span className="ip-em-unread-dot" aria-hidden /> : null}
                        </td>
                        <td>{roleLine(t)}</td>
                        <td>{t.last_message || t.subject || '—'}</td>
                        <td>{formatWhen(t.last_message_at || t.updated_at)}</td>
                        <td>{t.application_status || 'Open'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="ip-em-empty-list">No conversations match.</p>
            )}
          </div>
        </aside>

        <section className="ip-em-thread">
          {!selectedId ? (
            <div className="ip-em-thread-empty">Select a conversation to read and reply.</div>
          ) : loadingThread && !thread ? (
            <div className="ip-em-thread-empty">Loading thread…</div>
          ) : !thread ? (
            <div className="ip-em-thread-empty">{error || 'Thread not found.'}</div>
          ) : (
            <>
              <div className="ip-em-thread-head">
                <div className="ip-em-thread-person">
                  <div className="ip-em-avatar">{initials(counterpartName(thread, role))}</div>
                  <div>
                    <h3>{counterpartName(thread, role)}</h3>
                    <p>
                      {roleLine(thread)}
                      {subtitleLine(thread, role) ? (
                        <>
                          {' '}
                          — <span>{subtitleLine(thread, role)}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="ip-em-thread-actions">
                  {thread.candidate_cgpa != null && thread.candidate_cgpa !== '' ? (
                    <span className="ip-em-cgpa">{thread.candidate_cgpa} CGPA</span>
                  ) : null}
                  <button type="button" className="ip-em-btn ip-em-btn--resume" onClick={openResume}>
                    <FileText className="size-3.5" aria-hidden />
                    Resume
                  </button>
                  <button
                    type="button"
                    className="ip-em-btn ip-em-btn--ghost"
                    title="Archive conversation"
                    onClick={() => setArchived(selectedId, true)}
                  >
                    <Archive className="size-3.5" aria-hidden />
                    Archive
                  </button>
                </div>
              </div>

              {error ? <div className="ip-em-alert">{error}</div> : null}

              <div className="ip-em-feed" ref={feedRef}>
                <span className="ip-em-secure">Secure Application Thread</span>
                {messages.map((m) => {
                  const mine =
                    m.sender_role === 'employer' || m.sender_user_id === thread.employer_user_id;
                  return (
                    <div
                      key={m.id}
                      className={`ip-em-bubble-row ${mine ? 'ip-em-bubble-row--me' : 'ip-em-bubble-row--them'}`}
                    >
                      <div className={`ip-em-bubble ${mine ? 'ip-em-bubble--me' : 'ip-em-bubble--them'}`}>
                        {m.body ? <p>{m.body}</p> : null}
                        {m.attachment_url ? (
                          <div className="ip-em-file">
                            <Paperclip className="size-3.5" aria-hidden />
                            <a href={m.attachment_url} target="_blank" rel="noopener noreferrer">
                              {m.attachment_name || 'Attachment'}
                            </a>
                            {m.attachment_size ? <span>({formatBytes(m.attachment_size)})</span> : null}
                          </div>
                        ) : null}
                        <time dateTime={m.sent_at}>{formatBubbleTime(m.sent_at)}</time>
                      </div>
                    </div>
                  );
                })}
                {!messages.length ? (
                  <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                    No messages yet — say hello below.
                  </p>
                ) : null}
              </div>

              {pendingFile ? (
                <div className="ip-em-attach-bar">
                  <span>
                    <strong>{pendingFile.name}</strong> ({formatBytes(pendingFile.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingFile(null);
                      if (fileRef.current) fileRef.current.value = '';
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              <form className="ip-em-composer" onSubmit={send}>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ATTACH_ACCEPT}
                  onChange={onPickFile}
                />
                <button
                  type="button"
                  className="ip-em-attach"
                  title="Attach file"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="size-5" aria-hidden />
                </button>
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Reply to ${activeName}...`}
                  aria-label="Reply"
                />
                <button
                  type="submit"
                  className="ip-em-btn ip-em-btn--primary"
                  disabled={!canSend}
                >
                  <Send className="size-3.5" aria-hidden />
                  Send
                </button>
              </form>
            </>
          )}
        </section>
        <ThreadPartyPanel role={role} thread={selectedId ? thread : null} />
      </div>
    </div>
  );
}
