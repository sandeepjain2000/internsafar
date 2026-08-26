'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, ClipboardList, Hourglass, MessageSquare, RotateCcw, Search, SlidersHorizontal, Target, XCircle } from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import { normalizePrefsFilters, useListPrefsSync } from '@/hooks/useListPrefsSync';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { formatStatus } from '@/lib/utils';
import {
  APPLICATION_NEXT_STEP_OPTIONS,
  applicationNextStepFilterMatch,
} from '@/lib/ipApplicationPresentation';
import '@/components/ip/ip-applications-gemini.css';

const PAGE_SIZE = 10;

const TABS = [
  { id: 'all', label: 'All Applications' },
  { id: 'applied', label: 'Applied (Submitted)' },
  { id: 'review', label: 'Under Review (Shortlisted)' },
  { id: 'interview', label: 'Interview Scheduled' },
  { id: 'offer', label: 'Offer Received' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

const QUICK_CHIPS = [
  { id: 'starting-soon', label: 'Starting soon' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'verified', label: 'Verified employers' },
];

const STIPEND_OPTIONS = [
  { value: '0', label: 'Any stipend' },
  { value: '10000', label: '₹10,000+ / mo' },
  { value: '15000', label: '₹15,000+ / mo' },
  { value: '20000', label: '₹20,000+ / mo' },
];

const WORK_MODE_OPTIONS = [
  { value: '', label: 'Any work mode' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'On-site', label: 'On-site' },
];

const APPLIED_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function matchesQuickChip(a, chip) {
  if (!chip) return true;
  if (chip === 'starting-soon') {
    const raw = a.start_date || a.starts_at;
    if (!raw) return false;
    const start = new Date(raw).getTime();
    if (Number.isNaN(start)) return false;
    const now = Date.now();
    return start >= now && start <= now + 21 * 86400000;
  }
  if (chip === 'recent') {
    const t = new Date(a.updated_at || a.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t <= 7 * 86400000;
  }
  if (chip === 'verified') return Boolean(a.employer_verified);
  return true;
}

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

function statusLabel(a) {
  return a.display_status || formatStatus(a.status) || 'Applied';
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
  const [chip, setChip] = useState('');
  const [minStipend, setMinStipend] = useState('0');
  const [workMode, setWorkMode] = useState('');
  const [locations, setLocations] = useState([]);
  const [appliedWithin, setAppliedWithin] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [viewMode, setViewMode] = useViewMode('ip_apps_view', 'list');
  const [loadError, setLoadError] = useState('');

  const snapshot = useMemo(
    () => ({
      filters: {
        q, tab, chip, minStipend, workMode, locations, appliedWithin, nextStep,
      },
      sort,
    }),
    [q, tab, chip, minStipend, workMode, locations, appliedWithin, nextStep, sort],
  );
  const prefs = useListPrefsSync({
    tableKey: 'candidate.applications',
    snapshot,
    applySnapshot: (s) => {
      const f = normalizePrefsFilters(s?.filters);
      setQ(f.q != null ? String(f.q) : '');
      setTab(f.tab != null && f.tab !== '' ? String(f.tab) : 'all');
      let nextChip = f.chip != null ? String(f.chip) : '';
      if (nextChip === 'saved' || !QUICK_CHIPS.some((c) => c.id === nextChip)) nextChip = '';
      setChip(nextChip);
      setMinStipend(f.minStipend != null ? String(f.minStipend) : '0');
      setWorkMode(f.workMode != null ? String(f.workMode) : '');
      setLocations(Array.isArray(f.locations) ? f.locations.map(String) : []);
      setAppliedWithin(f.appliedWithin != null ? String(f.appliedWithin) : '');
      // Prefer nextStep; migrate legacy nextQ free-text presets to empty
      const legacyNext = f.nextStep != null ? String(f.nextStep) : '';
      setNextStep(
        APPLICATION_NEXT_STEP_OPTIONS.some((o) => o.value && o.value === legacyNext)
          ? legacyNext
          : '',
      );
      setSort(s?.sort != null && s.sort !== '' ? String(s.sort) : 'latest');
      if (
        Number(f.minStipend) > 0
        || f.workMode
        || (Array.isArray(f.locations) && f.locations.length)
        || f.appliedWithin
        || (legacyNext && APPLICATION_NEXT_STEP_OPTIONS.some((o) => o.value === legacyNext))
      ) {
        setAdvancedOpen(true);
      }
    },
  });

  const metrics = useMemo(() => {
    const total = items.length;
    const review = items.filter((a) => String(a.status || '').toLowerCase() === 'shortlisted').length;
    const interview = items.filter((a) => String(a.status || '').toLowerCase() === 'interviewing').length;
    const offers = items.filter((a) => ['offered', 'hired'].includes(String(a.status || '').toLowerCase())).length;
    return { total, review, interview, offers };
  }, [items]);

  const locationOptions = useMemo(() => {
    const map = new Map();
    for (const a of items) {
      const loc = String(a.location || '').trim();
      if (!loc) continue;
      const key = loc.toLowerCase();
      if (!map.has(key)) map.set(key, { value: loc, label: loc });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const advancedActive = Boolean(
    Number(minStipend) > 0
    || workMode
    || locations.length
    || appliedWithin
    || nextStep,
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const stipendFloor = Number(minStipend) || 0;
    const modeNeedle = String(workMode || '').toLowerCase().replace(/[\s_-]/g, '');
    const locSet = new Set(locations.map((v) => String(v).toLowerCase()));
    const appliedDays = Number(appliedWithin) || 0;
    const now = Date.now();
    let rows = items.slice();
    if (tab !== 'all') rows = rows.filter((a) => a.status_tab === tab);
    rows = rows.filter((a) => matchesQuickChip(a, chip));
    if (stipendFloor) {
      rows = rows.filter((a) => Number(a.stipend_inr || 0) >= stipendFloor);
    }
    if (modeNeedle) {
      rows = rows.filter((a) => {
        const mode = String(a.work_mode || '').toLowerCase().replace(/[\s_-]/g, '');
        if (modeNeedle === 'onsite') return mode.includes('onsite');
        return mode.includes(modeNeedle);
      });
    }
    if (locSet.size) {
      rows = rows.filter((a) => locSet.has(String(a.location || '').toLowerCase()));
    }
    if (appliedDays) {
      rows = rows.filter((a) => {
        const t = new Date(a.created_at).getTime();
        if (Number.isNaN(t)) return false;
        return now - t <= appliedDays * 86400000;
      });
    }
    if (nextStep) {
      rows = rows.filter((a) => applicationNextStepFilterMatch(a, nextStep));
    }
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
  }, [items, q, sort, tab, chip, minStipend, workMode, locations, appliedWithin, nextStep]);

  const { page, setPage, totalPages, total, pageItems } = useClientPagination(filtered, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, sort, tab, chip, minStipend, workMode, locations, appliedWithin, nextStep, setPage]);

  function resetFilters() {
    setQ('');
    setTab('all');
    setChip('');
    setSort('latest');
    setMinStipend('0');
    setWorkMode('');
    setLocations([]);
    setAppliedWithin('');
    setNextStep('');
    setAdvancedOpen(false);
  }

  async function load() {
    setLoadError('');
    const res = await fetch('/api/ip/candidate/applications?pageSize=500', {
      cache: 'no-store',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setItems([]);
      setTotalServer(0);
      setLoadError(data.error || 'Could not load applications');
      return;
    }
    const list = Array.isArray(data.items) ? data.items : [];
    setItems(list);
    setTotalServer(Number(data.total) || list.length);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

      {loadError ? <p className="ip-ap-empty" style={{ margin: '0.75rem 0' }}>{loadError}</p> : null}

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
          <button type="button" className="ip-ap-btn ip-ap-btn--ghost" onClick={resetFilters}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset filters
          </button>
          <button
            type="button"
            className={`ip-ap-btn ip-ap-btn--ghost${advancedOpen || advancedActive ? ' is-on' : ''}`}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Advanced filters
            {advancedActive ? <span className="ip-ap-adv-on">On</span> : null}
          </button>
        </div>
        {advancedOpen ? (
          <div className="ip-ap-advanced" role="region" aria-label="Advanced application filters">
            <label className="ip-ap-advanced__field">
              <span>Stipend</span>
              <select value={minStipend} onChange={(e) => setMinStipend(e.target.value)} aria-label="Minimum stipend">
                {STIPEND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-ap-advanced__field">
              <span>Work Mode</span>
              <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Work mode">
                {WORK_MODE_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-ap-advanced__field">
              <span>Location</span>
              <SearchableMultiSelect
                options={locationOptions}
                value={locations}
                onChange={setLocations}
                placeholder="Search locations…"
                ariaLabel="Filter by location"
              />
            </label>
            <label className="ip-ap-advanced__field">
              <span>Applied</span>
              <select value={appliedWithin} onChange={(e) => setAppliedWithin(e.target.value)} aria-label="Applied date">
                {APPLIED_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-ap-advanced__field">
              <span>Next</span>
              <select value={nextStep} onChange={(e) => setNextStep(e.target.value)} aria-label="Next step">
                {APPLICATION_NEXT_STEP_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <ListPresetsBar {...prefs} />
        <div className="ip-ap-chips" role="tablist" aria-label="Quick filters">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.id || 'all'}
              type="button"
              className={`ip-ap-qchip${chip === c.id ? ' is-on' : ''}`}
              onClick={() => setChip((prev) => (prev === c.id ? '' : c.id))}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="ip-ap-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? 'is-on' : undefined}
              onClick={() => setTab(t.id)}
              title={
                t.id === 'applied'
                  ? 'Waiting for the employer to open your application'
                  : t.id === 'review'
                    ? 'Employer has shortlisted you'
                    : undefined
              }
            >
              {t.label}{t.id === 'all' ? ` (${tabCount('all')})` : ''}
            </button>
          ))}
        </div>
        <p className="ip-ap-tab-hint">
          <strong>Applied (Submitted)</strong> — waiting for the employer to open your application.
          {' '}
          <strong>Under Review (Shortlisted)</strong> — the employer has shortlisted you.
        </p>
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
                <p className="mt-1 text-xs text-slate-500">
                  {[stipendLabel(a), [a.work_mode, a.location].filter(Boolean).join(' • ')].filter((x) => x && x !== '—').join(' · ') || '—'}
                </p>
                <p className="mt-2 text-sm">
                  <span className={`ip-ap-badge ${statusClass(a.status)}`}>{statusLabel(a)}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">Applied {appliedDate(a.created_at)} · {a.next_step || '—'}</p>
                <div className="ip-ap-actions__row mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
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
              </div>
            ))}
          </div>
        ) : null}
        {viewMode === 'list' ? (
        <div className="ip-ph-list-wrap">
          <table className="ip-ph-list">
            <thead>
              <tr>
                <th>Role</th>
                <th>Employer</th>
                <th>Stipend</th>
                <th>Work Mode / Location</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Next</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/candidate/internships/${a.internship_id}`} className="ip-ph-role">
                      {a.title || 'Internship'}
                    </Link>
                  </td>
                  <td>{a.company_name || '—'}</td>
                  <td>{stipendLabel(a)}</td>
                  <td>{[a.work_mode, a.location].filter(Boolean).join(' • ') || '—'}</td>
                  <td>{appliedDate(a.created_at)}</td>
                  <td>
                    <span className={`ip-ap-badge ${statusClass(a.status)}`}>
                      {statusLabel(a)}
                    </span>
                  </td>
                  <td>{a.next_step || '—'}</td>
                  <td>
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
              <button type="button" className="ip-ap-btn ip-ap-btn--primary" onClick={resetFilters}>
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
                  <span className={`ip-ap-badge ${statusClass(detail.status)}`}>{statusLabel(detail)}</span>
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
