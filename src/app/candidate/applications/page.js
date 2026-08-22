'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardList, Hourglass, MessageSquare, Search, Target, XCircle } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import '@/components/ip/ip-applications-gemini.css';

const PAGE_SIZE = 10;

const TABS = [
  { id: 'all', label: 'All Applications' },
  { id: 'applied', label: 'Applied' },
  { id: 'review', label: 'Under Review' },
  { id: 'interview', label: 'Interview Scheduled' },
  { id: 'offer', label: 'Offer Received' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

function stipendLabel(a) {
  if (a.stipend_inr) return `₹${Number(a.stipend_inr).toLocaleString('en-IN')}/mo`;
  return '—';
}

function appliedDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'applied' || s === 'pending') return 'is-applied';
  if (s === 'shortlisted') return 'is-review';
  if (s.includes('interview')) return 'is-interview';
  if (s === 'offered' || s === 'hired' || s === 'completed' || s === 'accepted') return 'is-offer';
  if (s === 'rejected' || s === 'declined_offer') return 'is-rejected';
  if (s === 'withdrawn') return 'is-withdrawn';
  return 'is-other';
}

function canWithdraw(status) {
  const s = String(status || '').toLowerCase();
  return s === 'applied' || s === 'pending';
}

export default function MyApplicationsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [totalServer, setTotalServer] = useState(0);
  const [threadByInternship, setThreadByInternship] = useState({});
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('latest');
  const [tab, setTab] = useState('all');
  const [interviewFilter, setInterviewFilter] = useState('');
  const [offerFilter, setOfferFilter] = useState('');
  const [commFilter, setCommFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [viewMode, setViewMode] = useViewMode('ip_apps_view', 'list');

  const metrics = useMemo(() => {
    const total = items.length;
    const review = items.filter((a) => ['applied', 'pending', 'shortlisted'].includes(String(a.status || '').toLowerCase())).length;
    const interview = items.filter((a) => String(a.status || '').toLowerCase() === 'interviewing').length;
    const offers = items.filter((a) => ['offered', 'hired'].includes(String(a.status || '').toLowerCase())).length;
    return { total, review, interview, offers };
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = items.slice();
    if (tab !== 'all') rows = rows.filter((a) => a.status_tab === tab);
    if (needle) {
      rows = rows.filter((a) => {
        const title = String(a.title || '').toLowerCase();
        const company = String(a.company_name || '').toLowerCase();
        return title.includes(needle) || company.includes(needle);
      });
    }
    rows.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      if (sort === 'status') return String(a.display_status || a.status).localeCompare(String(b.display_status || b.status));
      if (sort === 'match') return (b.match_score ?? -1) - (a.match_score ?? -1);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return rows;
  }, [items, q, sort, tab]);

  const { page, setPage, totalPages, total, pageItems, serialOffset } = useClientPagination(filtered, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, sort, tab, setPage]);

  async function load() {
    const params = new URLSearchParams();
    if (tab && tab !== 'all') params.set('status', tab);
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);
    if (interviewFilter) params.set('interview', interviewFilter);
    if (offerFilter) params.set('offer', offerFilter);
    if (commFilter) params.set('communication', commFilter);
    params.set('pageSize', '100');
    const res = await fetch(`/api/ip/candidate/applications?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setTotalServer(data.total || (data.items || []).length);
    try {
      localStorage.setItem(
        'ip_candidate_app_filters',
        JSON.stringify({ tab, sort, interviewFilter, offerFilter, commFilter }),
      );
    } catch { /* ignore */ }
  }

  async function loadThreads() {
    const res = await fetch('/api/ip/messages/threads');
    const data = await res.json().catch(() => ({}));
    const map = {};
    (data.items || []).forEach((t) => {
      if (t.internship_id) map[t.internship_id] = t.id;
    });
    setThreadByInternship(map);
  }

  useEffect(() => {
    load();
    loadThreads();
  }, [tab, sort, interviewFilter, offerFilter, commFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function openThread(internshipId) {
    const threadId = threadByInternship[internshipId];
    router.push(threadId ? `/candidate/messages/${threadId}` : '/candidate/messages');
  }

  async function withdraw(id) {
    await fetch(`/api/ip/candidate/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'withdrawn' }),
    });
    setDetail(null);
    await load();
  }

  function tabCount(id) {
    if (id === 'all') return items.length;
    return items.filter((a) => a.status_tab === id).length;
  }

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-apps">
      <div className="ip-ap-hero">
        <div>
          <div className="ip-ap-hero__title">
            <h1>My Applications</h1>
            <span className="ip-ap-chip">{metrics.total} Submission{metrics.total === 1 ? '' : 's'}</span>
          </div>
          <p>Track status, interview schedules, recruiter messages, and outcomes for all applied roles.</p>
        </div>
        <Link href="/candidate/internships" className="ip-ap-btn ip-ap-btn--primary">
          + Browse More Internships
        </Link>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="ip-ap-metrics">
        <div className="ip-ap-metric">
          <div>
            <span>Total Submitted</span>
            <strong>{metrics.total}</strong>
          </div>
          <span className="ip-ap-metric__ico is-slate"><ClipboardList /></span>
        </div>
        <div className="ip-ap-metric">
          <div>
            <span>In Review</span>
            <strong className="is-amber">{metrics.review}</strong>
          </div>
          <span className="ip-ap-metric__ico is-amber"><Hourglass /></span>
        </div>
        <div className="ip-ap-metric">
          <div>
            <span>Interviews Scheduled</span>
            <strong className="is-brand">{metrics.interview}</strong>
          </div>
          <span className="ip-ap-metric__ico is-brand"><CalendarDays /></span>
        </div>
        <div className="ip-ap-metric">
          <div>
            <span>Offers Received</span>
            <strong className="is-ok">{metrics.offers}</strong>
          </div>
          <span className="ip-ap-metric__ico is-ok"><Target /></span>
        </div>
      </div>

      <div className="ip-ap-toolbar">
        <div className="ip-ap-toolbar__row">
          <div className="ip-ap-search">
            <Search />
            <input
              type="search"
              placeholder="Search by role or company name..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search applications"
            />
          </div>
          <label className="ip-ap-sort">
            <span>Sort by:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort applications">
              <option value="latest">Latest First</option>
              <option value="oldest">Oldest First</option>
              <option value="status">Status</option>
              <option value="match">Highest match</option>
            </select>
          </label>
        </div>
        <div className="ip-ap-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'is-on' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}{t.id === 'all' ? ` (${tabCount('all')})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="ip-ap-sheet">
        {viewMode === 'cards' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {pageItems.map((a) => (
              <div key={a.id} className="rounded-lg border bg-white p-4">
                <Link href={`/candidate/internships/${a.internship_id}`} className="font-semibold">
                  {a.title || 'Internship'}
                </Link>
                <p className="text-sm text-slate-500">{a.company_name}</p>
                <p className="mt-2 text-sm">{a.display_status}</p>
                <button type="button" className="ip-ap-btn ip-ap-btn--ghost mt-2" onClick={() => setDetail(a)}>
                  View Details
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {viewMode === 'list' ? (
        <div className="ip-ap-table-wrap">
          <table className="ip-ap-table">
            <thead>
              <tr>
                <th className="ip-ap-num">#</th>
                <th>Internship Role &amp; Employer</th>
                <th>Stipend &amp; Location</th>
                <th>Applied Date</th>
                <th>Current Status</th>
                <th>What Happens Next</th>
                <th className="ip-ap-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a, idx) => (
                <tr key={a.id}>
                  <td className="ip-ap-num">{serialOffset + idx + 1}</td>
                  <td>
                    <Link href={`/candidate/internships/${a.internship_id}`} className="ip-ap-title">
                      {a.title || 'Internship'}
                    </Link>
                    <div className="ip-ap-company">
                      {a.company_name || '—'}
                      {a.employer_verified ? <span className="ip-ap-verified" title="Verified employer">✓</span> : null}
                    </div>
                    {a.match_score != null ? (
                      <div className="ip-ap-match-chip">★ {Math.round(Number(a.match_score))}% match</div>
                    ) : null}
                  </td>
                  <td>
                    <div className="ip-ap-stipend">{stipendLabel(a)}</div>
                    <div className="ip-ap-muted">{[a.work_mode, a.location].filter(Boolean).join(' • ') || '—'}</div>
                  </td>
                  <td className="ip-ap-muted">{appliedDate(a.created_at)}</td>
                  <td>
                    <span className={`ip-ap-badge ${statusClass(a.status)}`}>
                      {a.display_status || 'Applied'}
                    </span>
                  </td>
                  <td className="ip-ap-next">{a.next_step || '—'}</td>
                  <td className="ip-ap-actions">
                    <div className="ip-ap-actions__row">
                      <button type="button" className="ip-ap-btn ip-ap-btn--ghost" onClick={() => setDetail(a)}>
                        View Details
                      </button>
                      <button
                        type="button"
                        className="ip-ap-icon"
                        title="Message employer"
                        aria-label="Message employer"
                        onClick={() => openThread(a.internship_id)}
                      >
                        <MessageSquare />
                      </button>
                      <button
                        type="button"
                        className="ip-ap-icon is-withdraw"
                        title="Withdraw application"
                        aria-label="Withdraw application"
                        disabled={!canWithdraw(a.status)}
                        onClick={() => withdraw(a.id)}
                      >
                        <XCircle />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        ) : null}

        {!filtered.length ? (
          <div className="ip-ap-empty">
            <h3>No applications found</h3>
            <p>
              {items.length
                ? 'There are no applications matching your current status filter or search parameters.'
                : 'You have not submitted any applications yet.'}
            </p>
            {items.length ? (
              <button type="button" className="ip-ap-btn ip-ap-btn--primary" onClick={() => { setTab('all'); setQ(''); }}>
                Clear Status Filters
              </button>
            ) : (
              <Link href="/candidate/internships" className="ip-ap-btn ip-ap-btn--primary">Browse Internships</Link>
            )}
          </div>
        ) : null}

        {total > 0 ? (
          <div className="ip-ap-pager">
            <span>Showing {from}–{to} of {total}</span>
            <div className="ip-ap-pager__btns">
              <button type="button" className="ip-ap-btn ip-ap-btn--ghost" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>Previous</button>
              <span>Page {page} / {totalPages}</span>
              <button type="button" className="ip-ap-btn ip-ap-btn--ghost" disabled={page >= totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))}>Next</button>
            </div>
          </div>
        ) : null}
      </div>

      {detail ? (
        <div className="ip-ap-modal" role="dialog" aria-modal="true" aria-labelledby="ip-ap-detail-title">
          <button type="button" className="ip-ap-modal__backdrop" aria-label="Close" onClick={() => setDetail(null)} />
          <div className="ip-ap-modal__card">
            <div className="ip-ap-modal__head">
              <div>
                <div className="ip-ap-modal__title-row">
                  <h2 id="ip-ap-detail-title">{detail.title || 'Internship'}</h2>
                  <span className={`ip-ap-badge ${statusClass(detail.status)}`}>{detail.display_status}</span>
                </div>
                <p>{detail.company_name} • Applied on {appliedDate(detail.created_at)}</p>
              </div>
              <button type="button" className="ip-ap-icon" onClick={() => setDetail(null)} aria-label="Close">×</button>
            </div>
            <div className="ip-ap-modal__body">
              <p className="ip-ap-next">{detail.next_step}</p>
              <dl>
                <div><dt>Stipend</dt><dd>{stipendLabel(detail)}</dd></div>
                <div><dt>Work mode</dt><dd>{detail.work_mode || '—'}</dd></div>
                <div><dt>Location</dt><dd>{detail.location || '—'}</dd></div>
                <div><dt>Match</dt><dd>{detail.match_score != null ? `${Math.round(Number(detail.match_score))}%` : '—'}</dd></div>
              </dl>
              <p className="ip-ap-muted">Status history is shown from live application updates. Candidates cannot edit this record.</p>
            </div>
            <div className="ip-ap-modal__foot">
              <Link href={`/candidate/internships/${detail.internship_id}`} className="ip-ap-btn ip-ap-btn--ghost">Open internship</Link>
              <button type="button" className="ip-ap-btn ip-ap-btn--ghost" onClick={() => openThread(detail.internship_id)}>Message employer</button>
              {canWithdraw(detail.status) ? (
                <button type="button" className="ip-ap-btn ip-ap-btn--danger" onClick={() => withdraw(detail.id)}>Withdraw</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
