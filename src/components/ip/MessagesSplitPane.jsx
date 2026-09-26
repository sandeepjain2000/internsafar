'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive,
  Calendar,
  ChevronLeft,
  FileText,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpListPager from '@/components/ip/IpListPager';
import { isStoredMeetUrl, meetJoinLabel } from '@/lib/ipInterviewMeetUrl';
import {
  formatBytes,
  formatDurationMonths,
  formatStipendInr,
} from '@/lib/ipMessagePresentation';
import { toTitleCaseLabel } from '@/lib/ipTitleCase';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';
import { readResponseJson } from '@/lib/readResponseJson';
// Both roles now render the candidate layout: the employer tree keeps its own content and
// actions but uses this stylesheet, scoped by .ip-cand-msg--employer for its extras.
// ip-employer-messages-gemini.css is intentionally no longer imported.
import '@/components/ip/ip-candidate-messages-gemini.css';
import '@/components/ip/ip-list-pager.css';

const PAGE_SIZE = 10;

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

/**
 * Inbox column filters — same five slots for both roles, labels differ:
 * Employer: Candidate · Internship · Preview · When · Status
 * Candidate: Employer · Internship · Preview · When · Status
 * `party` holds the counterpart name (Employer / Candidate).
 */
const EMPTY_COLS = {
  party: '',
  internship: '',
  preview: '',
  when: 'any',
  status: '',
};

/** Map older employer presets that stored `candidate` instead of `party`. */
function normalizeCols(raw) {
  const next = { ...EMPTY_COLS, ...(raw || {}) };
  if (!next.party && raw?.candidate) next.party = raw.candidate;
  delete next.candidate;
  return next;
}

const WHEN_WINDOWS = [
  ['any', 'Any time'],
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['older', 'Older than 30 days'],
];

function withinWhen(value, window) {
  if (window === 'any') return true;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const days = (Date.now() - d.getTime()) / 86400000;
  if (window === 'today') return d.toDateString() === new Date().toDateString();
  if (window === '7d') return days <= 7;
  if (window === '30d') return days <= 30;
  if (window === 'older') return days > 30;
  return true;
}

function has(haystack, needle) {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return String(haystack || '').toLowerCase().includes(q);
}

function roleLine(t) {
  if (t.internship_title) return t.internship_title;
  if (t.candidate_specialization) return t.candidate_specialization;
  if (t.candidate_degree) return t.candidate_degree;
  return t.subject || 'Conversation';
}

/** Compact employer/internship (or candidate/internship) context row — not a side column. */
function ThreadPartyPanel({ role, thread }) {
  if (role === 'candidate') {
    if (!thread) {
      return (
        <aside className="ip-msg-party" aria-label="Conversation context">
          <p className="ip-msg-party__hint">
            Employer- and internship-based conversations. Select a thread to see which employer and role it is for.
          </p>
        </aside>
      );
    }
    const company = thread.company_name || thread.employer_name || 'Employer';
    const internship = thread.internship_title || 'General conversation';
    return (
      <aside className="ip-msg-party" aria-label="Conversation context">
        <span className="ip-msg-party__kicker">Employer &amp; internship</span>
        <div className="ip-msg-party__row">
          <span className="ip-msg-party__item">
            <span className="ip-msg-party__label">Employer</span>
            <strong>{company}</strong>
          </span>
          <span className="ip-msg-party__sep" aria-hidden>
            ·
          </span>
          <span className="ip-msg-party__item">
            <span className="ip-msg-party__label">Internship</span>
            <strong>{internship}</strong>
          </span>
          {thread.internship_id ? (
            <Link className="ip-msg-party__link" href={`/candidate/internships/${thread.internship_id}`}>
              View role
            </Link>
          ) : null}
        </div>
      </aside>
    );
  }

  if (!thread) {
    return (
      <aside className="ip-msg-party" aria-label="Conversation context">
        <p className="ip-msg-party__hint">
          Candidate- and internship-based conversations. Select a thread to see which candidate and role it is for.
        </p>
      </aside>
    );
  }
  const name = thread.candidate_name || 'Candidate';
  const internship = thread.internship_title || 'General conversation';
  return (
    <aside className="ip-msg-party" aria-label="Conversation context">
      <span className="ip-msg-party__kicker">Candidate &amp; internship</span>
      <div className="ip-msg-party__row">
        <span className="ip-msg-party__item">
          <span className="ip-msg-party__label">Candidate</span>
          <strong>{name}</strong>
        </span>
        <span className="ip-msg-party__sep" aria-hidden>
          ·
        </span>
        <span className="ip-msg-party__item">
          <span className="ip-msg-party__label">Internship</span>
          <strong>{internship}</strong>
        </span>
        {thread.internship_id ? (
          <Link className="ip-msg-party__link" href={`/employer/internships/${thread.internship_id}`}>
            View role
          </Link>
        ) : null}
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
  const stipend = formatInternshipStipend({
    stipend_inr: t.internship_stipend_inr,
    stipend_inr_max: t.internship_stipend_inr_max,
    stipend_type: t.internship_stipend_type,
  });
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
  // Column filters — one per inbox table column. Saved views carry these for both roles.
  const [cols, setCols] = useState(EMPTY_COLS);
  const [showFilters, setShowFilters] = useState(false);
  const [pickedIds, setPickedIds] = useState([]);

  const snapshot = useMemo(
    () => ({ filters: { tab, search, cols }, sort }),
    [tab, search, sort, cols],
  );
  const prefs = useListPrefsSync({
    tableKey: isEmployer ? 'employer.messages' : 'candidate.messages',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.tab) setTab(f.tab);
      if (f.search != null) setSearch(f.search);
      if (s.sort) setSort(s.sort);
      // Older saved views may omit cols or still use employer key `candidate`.
      setCols(normalizeCols(f.cols));
    },
  });

  const colsActiveCount = Object.entries(cols).filter(([k, v]) => v !== EMPTY_COLS[k]).length;
  const colsActive = colsActiveCount > 0;

  const statusOptions = useMemo(() => {
    const known = [
      'New',
      'Open',
      'applied',
      'pending',
      'shortlisted',
      'interviewing',
      'offered',
      'rejected',
      'withdrawn',
      'hired',
      'completed',
      'declined_offer',
    ];
    const fromThreads = threads.map(
      (t) => t.application_status || (Number(t.message_count) ? 'Open' : 'New'),
    );
    return [...new Set([...known, ...fromThreads].map(String).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  }, [threads]);

  const partyOptions = useMemo(() => {
    const names = threads.map((t) => counterpartName(t, role)).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [threads, role]);

  const internshipOptions = useMemo(() => {
    const titles = threads.map((t) => roleLine(t)).filter(Boolean);
    return [...new Set(titles)].sort((a, b) => a.localeCompare(b));
  }, [threads]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  const loadThreads = useCallback(async () => {
    setLoadingList(true);
    try {
      const qs = tab === 'archived' ? '?archived=1' : '';
      const res = await fetch(`/api/ip/messages/threads${qs}`);
      const data = await readResponseJson(res, {});
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
    if (!prefs.ready) return;
    loadThreads();
  }, [prefs.ready, loadThreads]);

  useEffect(() => {
    if (threadFromUrl) setSelectedId(threadFromUrl);
  }, [threadFromUrl]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = threads.filter((t) => {
      // 'archived' is filtered server-side via ?archived=1; the rest narrow here.
      if (tab === 'unread' && !(Number(t.unread_count) > 0)) return false;
      if (tab === 'action' && !t.needs_action) return false;
      if (tab === 'unreplied') {
        const last = t.last_sender_user_id;
        const me = role === 'candidate' ? t.candidate_user_id : t.employer_user_id;
        if (!last || last !== me) return false;
      }
      // Column filters AND with tab + search for both roles.
      if (cols.party && counterpartName(t, role) !== cols.party) return false;
      if (cols.internship && roleLine(t) !== cols.internship) return false;
      if (!has(t.last_message || t.subject, cols.preview)) return false;
      {
        const statusLabel = t.application_status || (Number(t.message_count) ? 'Open' : 'New');
        if (cols.status && String(statusLabel).toLowerCase() !== String(cols.status).toLowerCase()) {
          return false;
        }
      }
      if (!withinWhen(t.last_message_at || t.updated_at, cols.when)) return false;
      if (!q) return true;
      const hay = `${counterpartName(t, role)} ${t.internship_title || ''} ${t.subject || ''} ${t.last_message || ''} ${t.candidate_college || ''} ${t.employer_name || ''} ${t.company_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
    if (sort === 'oldest') {
      return [...rows].reverse();
    }
    return rows;
  }, [threads, search, tab, role, sort, cols]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(
    filtered,
    PAGE_SIZE,
  );
  useEffect(() => {
    setPage(1);
  }, [tab, search, sort, cols, setPage]);

  useEffect(() => {
    setPickedIds([]);
  }, [tab, search, sort, cols, page]);

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
        const data = await readResponseJson(res, {});
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
        const upData = await readResponseJson(up, {});
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
      const data = await readResponseJson(res, {});
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
      const data = await readResponseJson(res, {});
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

  async function bulkSetArchived(archived) {
    const ids = pickedIds.filter(Boolean);
    if (!ids.length) return;
    setError('');
    let ok = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/ip/messages/threads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived }),
        });
        if (res.ok) ok += 1;
      } catch {
        /* continue */
      }
    }
    setPickedIds([]);
    if (ids.includes(selectedId)) selectThread('');
    showToast(
      archived
        ? `Archived ${ok} conversation${ok === 1 ? '' : 's'}`
        : `Unarchived ${ok} conversation${ok === 1 ? '' : 's'}`,
    );
    await loadThreads();
  }

  function togglePick(id, checked) {
    setPickedIds((prev) => {
      const set = new Set(prev);
      if (checked) set.add(id);
      else set.delete(id);
      return [...set];
    });
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

  const toastEl = toast ? <div className="ip-cm-toast">{toast}</div> : null;

  if (!isEmployer) {
    return (
      <div className={`ip-cand-msg${selectedId ? ' ip-cand-msg--thread-open' : ''}`}>
        {toastEl}
        <div className="ip-cm-banner">
          <h1 className="ip-cm-banner__title-desk">Employer Communications Inbox</h1>
          <h1 className="ip-cm-banner__title-mob">Messages</h1>
          <p className="ip-cm-banner__desk">Direct messaging hub for interview scheduling, technical screening, and offer discussions.</p>
          <p className="ip-cm-banner__mob">Conversations with employers</p>
        </div>
        <div className="ip-cm-policy">
          <div className="ip-cm-policy-icon" aria-hidden>i</div>
          <div>
            <strong>Keep it professional.</strong>{' '}
            <span className="ip-cm-policy__desk">
              Messaging Workflow: After you apply, you can open a conversation for that role. Reply in active threads below for interview scheduling and offer discussions.
            </span>
            <span className="ip-cm-policy__mob">Share files only through InternSafar when possible.</span>
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
                  placeholder="Search conversations…"
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
              <div className="ip-cm-presets">
                <ListPresetsBar {...prefs} />
              </div>
              <div className="ip-cm-adv">
                <button
                  type="button"
                  className="ip-cm-adv-toggle"
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}
                >
                  <SlidersHorizontal className="size-3.5" aria-hidden />
                  Filters
                  <span className="ip-cm-adv-state">{showFilters ? 'Hide' : 'Show'}</span>
                  {colsActiveCount > 0 ? (
                    <span className="ip-cm-adv-chip" aria-label={`${colsActiveCount} filters active`}>
                      {colsActiveCount}
                    </span>
                  ) : null}
                </button>
                {colsActive ? (
                  <button type="button" className="ip-cm-adv-clear" onClick={() => setCols(EMPTY_COLS)}>
                    Clear
                  </button>
                ) : null}
              </div>
              {showFilters ? (
                <div className="ip-cm-adv-grid">
                  <label>
                    <span>Employer</span>
                    <select
                      value={cols.party}
                      onChange={(e) => setCols((c) => ({ ...c, party: e.target.value }))}
                      aria-label="Filter by employer"
                    >
                      <option value="">Any employer</option>
                      {partyOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Internship</span>
                    <select
                      value={cols.internship}
                      onChange={(e) => setCols((c) => ({ ...c, internship: e.target.value }))}
                      aria-label="Filter by internship"
                    >
                      <option value="">Any internship</option>
                      {internshipOptions.map((title) => (
                        <option key={title} value={title}>{title}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Preview</span>
                    <input
                      type="search"
                      value={cols.preview}
                      onChange={(e) => setCols((c) => ({ ...c, preview: e.target.value }))}
                      placeholder="Filter by preview"
                    />
                  </label>
                  <label>
                    <span>When</span>
                    <select
                      value={cols.when}
                      onChange={(e) => setCols((c) => ({ ...c, when: e.target.value }))}
                    >
                      {WHEN_WINDOWS.map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={cols.status}
                      onChange={(e) => setCols((c) => ({ ...c, status: e.target.value }))}
                      aria-label="Filter by status"
                    >
                      <option value="">Any status</option>
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            <div className="ip-cm-list-body">
              {loadingList ? (
                <p className="ip-cm-empty-list">Loading…</p>
              ) : filtered.length ? (
                <>
                  <div className="ip-cm-cards" role="list">
                    {pageItems.map((t) => {
                      const unread = Number(t.unread_count) > 0;
                      const on = t.id === selectedId;
                      const name = counterpartName(t, role);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          role="listitem"
                          className={`ip-cm-card${on ? ' is-on' : ''}${unread ? ' is-unread' : ''}`}
                          onClick={() => selectThread(t.id)}
                        >
                          <div className="ip-cm-card__av" aria-hidden>{initials(name)}</div>
                          <div className="ip-cm-card__body">
                            <div className="ip-cm-card__top">
                              <span className="ip-cm-card__name">{name}</span>
                              <time>{formatWhen(t.last_message_at || t.updated_at)}</time>
                            </div>
                            <div className="ip-cm-card__preview">{t.last_message || t.subject || roleLine(t)}</div>
                          </div>
                          {unread ? <span className="ip-cm-unread" aria-label="Unread" /> : null}
                        </button>
                      );
                    })}
                  </div>
                  <table className="ip-ph-list ip-msg-table">
                    <thead>
                      <tr>
                        <th>Employer</th>
                        <th>Internship</th>
                        <th>Preview</th>
                        <th>When</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((t) => {
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
                </>
              ) : (
                <div className="ip-cm-empty-list">
                  <p style={{ fontWeight: 800, color: '#334155', margin: 0 }}>No conversations found</p>
                  <p style={{ margin: '0.35rem 0 0' }}>No messages match the current filter or search criteria.</p>
                </div>
              )}
            </div>
            {!loadingList && filtered.length ? (
              <IpListPager
                className="ip-list-pager--inbox"
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            ) : null}
          </aside>

          <section className="ip-cm-thread">
            <ThreadPartyPanel role={role} thread={selectedId ? thread : null} />
            {!selectedId ? (
              <div className="ip-cm-thread-empty">Select a conversation to view details.</div>
            ) : loadingThread && !thread ? (
              <div className="ip-cm-thread-empty">Loading thread…</div>
            ) : !thread ? (
              <div className="ip-cm-thread-empty">{error || 'Thread not found.'}</div>
            ) : (
              <>
                <div className="ip-cm-thread-head">
                  <button
                    type="button"
                    className="ip-cm-back"
                    aria-label="Back to inbox"
                    onClick={() => selectThread('')}
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
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
                    <Link href="/candidate/applications" className="ip-cm-btn ip-cm-btn--ghost ip-cm-btn--desk">
                      View Timeline
                    </Link>
                    <button
                      type="button"
                      className="ip-cm-btn ip-cm-btn--icon"
                      title={thread.archived ? 'Unarchive conversation' : 'Archive conversation'}
                      onClick={() => setArchived(thread.id, !thread.archived)}
                    >
                      <Archive className="size-3.5" aria-hidden />
                      <span className="ip-cm-archive-label">{thread.archived ? 'Unarchive' : 'Archive'}</span>
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
                  {thread.internship_title ? (
                    <div className="ip-cm-related">
                      <div className="ip-cm-related__title">Related internship</div>
                      <div className="ip-cm-related__meta">
                        {[thread.internship_title, counterpartName(thread, role), thread.internship_work_mode]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
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
                        placeholder="Type a message…"
                        aria-label="Reply"
                      />
                      <button type="submit" className="ip-cm-btn ip-cm-btn--primary" disabled={!canSend}>
                        <span className="ip-cm-send-label">Send</span>
                        <Send className="size-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }

  const bannerTitle = 'Candidate Communications Inbox';
  const bannerDesc =
    'Direct messaging hub for discussing interview availability, project briefs, and application updates.';

  return (
    <div className={`ip-cand-msg ip-cand-msg--employer${selectedId ? ' ip-cand-msg--thread-open' : ''}`}>
      {toastEl}

      <div className="ip-cm-banner">
        <div>
          <h1 className="ip-cm-banner__title-desk">{bannerTitle}</h1>
          <h1 className="ip-cm-banner__title-mob">Messages</h1>
          <p className="ip-cm-banner__desk">{bannerDesc}</p>
          <p className="ip-cm-banner__mob">Conversations with candidates</p>
        </div>
        <div className="ip-cm-count">
          <MessageSquare className="size-4" aria-hidden />
          <span>
            {threads.length} Active Conversation{threads.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="ip-cm-policy">
        <div className="ip-cm-policy-icon" aria-hidden>i</div>
        <div>
          <strong>Messaging Workflow:</strong>{' '}
          <span className="ip-cm-policy__desk">
            You open direct contact after reviewing an application. Use this inbox to run technical
            screening, schedule interviews, and discuss offers with candidates who have already applied.
          </span>
          <span className="ip-cm-policy__mob">Share files only through InternSafar when possible.</span>
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
                placeholder="Search candidates or roles..."
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

            <div className="ip-cm-adv">
              <button
                type="button"
                className="ip-cm-adv-toggle"
                aria-expanded={showFilters}
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Filters
                <span className="ip-cm-adv-state">{showFilters ? 'Hide' : 'Show'}</span>
                {colsActiveCount > 0 ? (
                  <span className="ip-cm-adv-chip" aria-label={`${colsActiveCount} filters active`}>
                    {colsActiveCount}
                  </span>
                ) : null}
              </button>
              {colsActive ? (
                <button type="button" className="ip-cm-adv-clear" onClick={() => setCols(EMPTY_COLS)}>
                  Clear
                </button>
              ) : null}
            </div>

            {showFilters ? (
              <div className="ip-cm-adv-grid">
                <label>
                  <span>Candidate</span>
                  <select
                    value={cols.party}
                    onChange={(e) => setCols((c) => ({ ...c, party: e.target.value }))}
                    aria-label="Filter by candidate"
                  >
                    <option value="">Any candidate</option>
                    {partyOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Internship</span>
                  <select
                    value={cols.internship}
                    onChange={(e) => setCols((c) => ({ ...c, internship: e.target.value }))}
                    aria-label="Filter by internship"
                  >
                    <option value="">Any internship</option>
                    {internshipOptions.map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Preview</span>
                  <input
                    type="search"
                    value={cols.preview}
                    onChange={(e) => setCols((c) => ({ ...c, preview: e.target.value }))}
                    placeholder="Filter by preview"
                  />
                </label>
                <label>
                  <span>When</span>
                  <select
                    value={cols.when}
                    onChange={(e) => setCols((c) => ({ ...c, when: e.target.value }))}
                  >
                    {WHEN_WINDOWS.map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={cols.status}
                    onChange={(e) => setCols((c) => ({ ...c, status: e.target.value }))}
                    aria-label="Filter by status"
                  >
                    <option value="">Any status</option>
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="px-3 pb-2">
              <ListPresetsBar {...prefs} />
            </div>
            {filtered.length ? (
              <div className="ip-cm-bulk px-3 pb-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every((t) => pickedIds.includes(t.id))}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setPickedIds((prev) => {
                        const set = new Set(prev);
                        for (const t of pageItems) {
                          if (on) set.add(t.id);
                          else set.delete(t.id);
                        }
                        return [...set];
                      });
                    }}
                  />
                  Select All
                </label>
                {tab === 'archived' ? (
                  <button
                    type="button"
                    className="ip-cm-adv-clear"
                    disabled={!pickedIds.length}
                    onClick={() => bulkSetArchived(false)}
                  >
                    Unarchive Selected ({pickedIds.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ip-cm-adv-clear"
                    disabled={!pickedIds.length}
                    onClick={() => bulkSetArchived(true)}
                  >
                    Archive Selected ({pickedIds.length})
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="ip-cm-list-body">
            {loadingList ? (
              <p className="ip-cm-empty-list">Loading…</p>
            ) : filtered.length ? (
              <>
                <div className="ip-cm-cards" role="list">
                  {pageItems.map((t) => {
                    const unread = Number(t.unread_count) > 0;
                    const on = t.id === selectedId;
                    const name = counterpartName(t, role);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="listitem"
                        className={`ip-cm-card${on ? ' is-on' : ''}${unread ? ' is-unread' : ''}`}
                        onClick={() => selectThread(t.id)}
                      >
                        <div className="ip-cm-card__av" aria-hidden>{initials(name)}</div>
                        <div className="ip-cm-card__body">
                          <div className="ip-cm-card__top">
                            <span className="ip-cm-card__name">{name}</span>
                            <time>{formatWhen(t.last_message_at || t.updated_at)}</time>
                          </div>
                          <div className="ip-cm-card__preview">{t.last_message || t.subject || roleLine(t)}</div>
                        </div>
                        {unread ? <span className="ip-cm-unread" aria-label="Unread" /> : null}
                      </button>
                    );
                  })}
                </div>
                <table className="ip-ph-list ip-msg-table">
                  <thead>
                    <tr>
                      <th style={{ width: '2.5rem' }}>
                        <span className="sr-only">Select</span>
                      </th>
                      <th>Candidate</th>
                      <th>Internship</th>
                      <th>Preview</th>
                      <th>When</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((t) => {
                      const unread = Number(t.unread_count) > 0;
                      const on = t.id === selectedId;
                      const name = counterpartName(t, role);
                      const statusRaw = t.application_status || (Number(t.message_count) ? 'Open' : 'New');
                      return (
                        <tr
                          key={t.id}
                          className={on ? 'is-on' : undefined}
                          onClick={() => selectThread(t.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={pickedIds.includes(t.id)}
                              onChange={(e) => togglePick(t.id, e.target.checked)}
                              aria-label={`Select conversation with ${name}`}
                            />
                          </td>
                          <td>
                            <strong>{name}</strong>
                            {unread ? <span className="ip-cm-unread" aria-label="Unread" /> : null}
                          </td>
                          <td>{roleLine(t)}</td>
                          <td className="ip-msg-table__preview">{t.last_message || t.subject || '—'}</td>
                          <td>{formatWhen(t.last_message_at || t.updated_at)}</td>
                          <td>{toTitleCaseLabel(statusRaw) || statusRaw}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : (
              <div className="ip-cm-empty-list">
                <p style={{ fontWeight: 800, color: '#334155', margin: 0 }}>No conversations found</p>
                <p style={{ margin: '0.35rem 0 0' }}>No messages match the current filter or search criteria.</p>
              </div>
            )}
          </div>
          {!loadingList && filtered.length ? (
            <IpListPager
              className="ip-list-pager--inbox"
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          ) : null}
        </aside>

        <section className="ip-cm-thread">
          <ThreadPartyPanel role={role} thread={selectedId ? thread : null} />
          {!selectedId ? (
            <div className="ip-cm-thread-empty">Select a conversation to read and reply.</div>
          ) : loadingThread && !thread ? (
            <div className="ip-cm-thread-empty">Loading thread…</div>
          ) : !thread ? (
            <div className="ip-cm-thread-empty">{error || 'Thread not found.'}</div>
          ) : (
            <>
              <div className="ip-cm-thread-head">
                <button
                  type="button"
                  className="ip-cm-back"
                  aria-label="Back to inbox"
                  onClick={() => selectThread('')}
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <div className="ip-cm-thread-person">
                  <div className="ip-cm-avatar">{initials(counterpartName(thread, role))}</div>
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
                <div className="ip-cm-thread-actions">
                  {thread.candidate_cgpa != null && thread.candidate_cgpa !== '' ? (
                    <span className="ip-cm-cgpa">{thread.candidate_cgpa} CGPA</span>
                  ) : null}
                  <button type="button" className="ip-cm-btn ip-cm-btn--resume" onClick={openResume}>
                    <FileText className="size-3.5" aria-hidden />
                    Resume
                  </button>
                  <button
                    type="button"
                    className="ip-cm-btn ip-cm-btn--ghost"
                    title={thread.archived ? 'Unarchive conversation' : 'Archive conversation'}
                    onClick={() => setArchived(thread.id, !thread.archived)}
                  >
                    <Archive className="size-3.5" aria-hidden />
                    {thread.archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>

              {error ? <div className="ip-cm-alert">{error}</div> : null}

              <div className="ip-cm-feed" ref={feedRef}>
                <span className="ip-cm-secure">Secure Application Thread</span>
                {messages.map((m) => {
                  const mine =
                    m.sender_role === 'employer' || m.sender_user_id === thread.employer_user_id;
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
                            {m.attachment_size ? <span>({formatBytes(m.attachment_size)})</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!messages.length ? (
                  <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                    No messages yet — open the conversation with a short intro below.
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
                      placeholder={`Reply to ${activeName}...`}
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
      </div>
    </div>
  );
}
