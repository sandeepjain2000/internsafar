'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BellOff,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Coins,
  FileText,
  Gift,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { normalizePrefsFilters, useListPrefsSync } from '@/hooks/useListPrefsSync';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import '@/components/ip/ip-employer-notifications-gemini.css';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpTablePagination from '@/components/ip/IpTablePagination';

const PAGE_SIZE = 10;

const TABS = ['All', 'Unread', 'Applications', 'Offers', 'Rewards', 'Time-limited', 'Last 24h', 'Last 7 days'];

const PRIORITY_OPTIONS = [
  { value: '', label: 'Any priority' },
  { value: 'urgent', label: 'Time-sensitive' },
  { value: 'action_required', label: 'Action Required' },
  { value: 'normal', label: 'Normal' },
];

const DEADLINE_OPTIONS = [
  { value: '', label: 'Any deadline' },
  { value: 'has', label: 'Has deadline' },
  { value: 'none', label: 'No deadline' },
];

const WHEN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'older', label: 'Older than 30 days' },
];

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Employer-facing bucket for filters / icons (from live category + link + copy). */
function resolveBucket(n) {
  const stored = String(n.category || '').toLowerCase();
  const blob = `${n.title || ''} ${n.body || ''} ${n.link || ''}`.toLowerCase();

  if (
    blob.includes('/offers') ||
    blob.includes('offer accepted') ||
    blob.includes('offer declined') ||
    /\boffer\b/.test(blob)
  ) {
    return 'offers';
  }
  if (
    stored === 'referral' ||
    blob.includes('/referral') ||
    blob.includes('/viral') ||
    blob.includes('referral') ||
    blob.includes('bonus points') ||
    blob.includes('points credited')
  ) {
    return 'rewards';
  }
  if (
    stored === 'application' ||
    blob.includes('/internships') ||
    blob.includes('application') ||
    blob.includes('applicant') ||
    blob.includes('applied')
  ) {
    return 'applications';
  }
  return 'system';
}

function actionFor(n, bucket) {
  const link = String(n.link || '');
  if (link.includes('/internships/') && link.split('/').length > 3) {
    return { label: 'Review Candidates', Icon: Users };
  }
  if (link.includes('/internships')) return { label: 'View Postings', Icon: FileText };
  if (link.includes('/offers')) return { label: 'View Offer', Icon: Award };
  if (link.includes('/referral') || link.includes('/viral')) {
    return { label: 'Check Points Balance', Icon: Gift };
  }
  if (link.includes('/profile')) return { label: 'View Organization Profile', Icon: Building2 };
  if (link.includes('/messages')) return { label: 'Open Messages', Icon: Users };
  if (bucket === 'applications') return { label: 'Review Candidates', Icon: Users };
  if (bucket === 'offers') return { label: 'View Offer', Icon: Award };
  if (bucket === 'rewards') return { label: 'Check Points Balance', Icon: Gift };
  if (bucket === 'system') return { label: 'View details', Icon: ShieldCheck };
  return { label: 'View details', Icon: Sparkles };
}

function iconFor(bucket) {
  if (bucket === 'applications') return { Icon: FileText, tone: 'applications' };
  if (bucket === 'offers') return { Icon: CheckCircle2, tone: 'offers' };
  if (bucket === 'rewards') return { Icon: Sparkles, tone: 'rewards' };
  return { Icon: ShieldCheck, tone: 'system' };
}

export default function EmployerNotificationsPage() {
  const [items, setItems] = useState([]);
  const [points, setPoints] = useState(null);
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const [titleQ, setTitleQ] = useState('');
  const [companies, setCompanies] = useState([]);
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');
  const [whenWindow, setWhenWindow] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('ip_emp_notif_view', 'cards');

  const snapshot = useMemo(
    () => ({
      filters: { tab, search, titleQ, companies, priority, deadline, whenWindow },
      sort: '',
    }),
    [tab, search, titleQ, companies, priority, deadline, whenWindow],
  );
  const prefs = useListPrefsSync({
    tableKey: 'employer.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = normalizePrefsFilters(s?.filters);
      setTab(f.tab != null && f.tab !== '' ? String(f.tab) : 'All');
      setSearch(f.search != null ? String(f.search) : '');
      setTitleQ(f.titleQ != null ? String(f.titleQ) : '');
      setCompanies(Array.isArray(f.companies) ? f.companies.map(String) : []);
      setPriority(f.priority != null ? String(f.priority) : '');
      setDeadline(f.deadline != null ? String(f.deadline) : '');
      setWhenWindow(f.whenWindow != null ? String(f.whenWindow) : '');
      if (
        (f.titleQ && String(f.titleQ).trim())
        || (Array.isArray(f.companies) && f.companies.length)
        || f.priority
        || f.deadline
        || f.whenWindow
      ) {
        setAdvancedOpen(true);
      }
    },
  });

  const advancedActive = Boolean(
    titleQ.trim()
    || companies.length
    || priority
    || deadline
    || whenWindow,
  );
  const filtersActive = tab !== 'All' || Boolean(search.trim()) || advancedActive;

  const companyOptions = useMemo(() => {
    const map = new Map();
    for (const n of items) {
      const c = String(n.company || '').trim();
      if (!c) continue;
      const key = c.toLowerCase();
      if (!map.has(key)) map.set(key, { value: c, label: c });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  async function load() {
    const [notifRes, refRes] = await Promise.all([
      fetch('/api/ip/notifications'),
      fetch('/api/ip/referral').catch(() => null),
    ]);
    const notifData = await notifRes.json().catch(() => ({}));
    setItems(notifData.items || []);
    if (refRes?.ok) {
      const refData = await refRes.json().catch(() => ({}));
      if (typeof refData.points === 'number') setPoints(refData.points);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function showToast(msg) {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 3000);
  }

  async function markAllRead() {
    await fetch('/api/ip/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    });
    await load();
    showToast('All notifications marked as read.');
  }

  async function markRead(id) {
    await fetch('/api/ip/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const unreadCount = items.filter((n) => !n.read_at).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const titleNeedle = titleQ.trim().toLowerCase();
    const companySet = new Set(companies.map((c) => String(c).toLowerCase()));
    return items.filter((n) => {
      const bucket = resolveBucket(n);
      if (tab === 'Unread' && n.read_at) return false;
      if (tab === 'Applications' && bucket !== 'applications') return false;
      if (tab === 'Offers' && bucket !== 'offers') return false;
      if (tab === 'Rewards' && bucket !== 'rewards') return false;
      if (tab === 'Time-limited') {
        const timed = bucket === 'offers' || /expir|deadline|accept/i.test(`${n.title} ${n.body}`);
        if (!timed) return false;
      }
      if (tab === 'Last 24h' || tab === 'Last 7 days') {
        const created = new Date(n.created_at).getTime();
        const hours = tab === 'Last 24h' ? 24 : 24 * 7;
        if (Number.isNaN(created) || Date.now() - created > hours * 3600000) return false;
      }

      if (titleNeedle) {
        const hay = `${n.title || ''} ${n.body || ''}`.toLowerCase();
        if (!hay.includes(titleNeedle)) return false;
      }
      if (companySet.size) {
        const company = String(n.company || '').toLowerCase();
        if (!companySet.has(company)) return false;
      }
      if (priority === 'urgent' || priority === 'action_required') {
        if (String(n.priority || '') !== priority) return false;
      } else if (priority === 'normal') {
        if (n.priority === 'urgent' || n.priority === 'action_required') return false;
      }
      if (deadline === 'has' && !n.deadlineText) return false;
      if (deadline === 'none' && n.deadlineText) return false;
      if (whenWindow === '24h' || whenWindow === '7d' || whenWindow === '30d' || whenWindow === 'older') {
        const created = new Date(n.created_at).getTime();
        if (Number.isNaN(created)) return false;
        const ageH = (Date.now() - created) / 3600000;
        if (whenWindow === '24h' && ageH > 24) return false;
        if (whenWindow === '7d' && ageH > 24 * 7) return false;
        if (whenWindow === '30d' && ageH > 24 * 30) return false;
        if (whenWindow === 'older' && ageH <= 24 * 30) return false;
      }

      if (!q) return true;
      return `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q);
    });
  }, [items, tab, search, titleQ, companies, priority, deadline, whenWindow]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [tab, search, titleQ, companies, priority, deadline, whenWindow, setPage]);

  function resetFilters() {
    setTab('All');
    setSearch('');
    setTitleQ('');
    setCompanies([]);
    setPriority('');
    setDeadline('');
    setWhenWindow('');
  }

  return (
    <div className="ip-emp-notif">
      {toastMsg ? (
        <div className="ip-en-toast" role="status">
          <Check size={16} aria-hidden />
          <span>{toastMsg}</span>
        </div>
      ) : null}

      <div className="ip-en-toolbar">
        <div className="ip-en-crumb">
          <span>Employer Workspace</span>
          <ChevronRight size={14} aria-hidden />
          <strong>Notifications</strong>
        </div>
        <div className="ip-en-toolbar-actions">
          <Link className="ip-en-pts-pill" href="/employer/referral">
            <span className="ip-en-pts-pill__dot" aria-hidden>
              <Coins size={12} />
            </span>
            <span>{points == null ? '— Reward Points' : `${points} Reward Points`}</span>
          </Link>
          <button type="button" className="ip-en-mark" onClick={markAllRead} disabled={!unreadCount}>
            <CheckCheck size={15} aria-hidden />
            Mark All Read
          </button>
        </div>
      </div>

      <div className="ip-en-header">
        <div>
          <div className="ip-en-title-row">
            <h1>Notifications</h1>
            {unreadCount > 0 ? <span className="ip-en-unread-badge">{unreadCount} Unread</span> : null}
          </div>
          <p>Stay updated on candidate applications, offer sign-offs, and platform reward milestones.</p>
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="ip-en-filters">
        <div className="ip-en-filters-bar">
          <div className="ip-en-filters-wrap">
            <button
              type="button"
              className={`ip-en-filters-btn${filtersOpen || tab !== 'All' ? ' is-on' : ''}`}
              aria-expanded={filtersOpen}
              aria-controls="ip-en-filters-panel"
              onClick={() => {
                setFiltersOpen((v) => !v);
                setAdvancedOpen(false);
              }}
            >
              <SlidersHorizontal size={14} aria-hidden />
              <span>Filters</span>
              {tab !== 'All' ? <span className="ip-en-filters-chip">{tab}</span> : null}
            </button>
            {filtersOpen ? (
              <div id="ip-en-filters-panel" className="ip-en-filters-panel" role="listbox" aria-label="Notification filters">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="option"
                    aria-selected={tab === t}
                    className={`ip-en-tab${tab === t ? ' ip-en-tab--on' : ''}`}
                    onClick={() => {
                      setTab(t);
                      setFiltersOpen(false);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`ip-en-filters-btn${advancedOpen || advancedActive ? ' is-on' : ''}`}
            aria-expanded={advancedOpen}
            aria-controls="ip-en-advanced-panel"
            onClick={() => {
              setAdvancedOpen((v) => !v);
              setFiltersOpen(false);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span>Advanced filters</span>
            {advancedActive ? <span className="ip-en-filters-chip">On</span> : null}
          </button>
          {filtersActive ? (
            <button type="button" className="ip-en-empty-btn" onClick={resetFilters}>
              Reset
            </button>
          ) : null}
        </div>
        {advancedOpen ? (
          <div id="ip-en-advanced-panel" className="ip-en-advanced" role="region" aria-label="Advanced notification filters">
            <label className="ip-en-advanced__field">
              <span>Title</span>
              <input
                type="search"
                value={titleQ}
                onChange={(e) => setTitleQ(e.target.value)}
                placeholder="Filter by title or body text…"
                aria-label="Filter by title"
              />
            </label>
            <label className="ip-en-advanced__field">
              <span>Company</span>
              <SearchableMultiSelect
                options={companyOptions}
                value={companies}
                onChange={setCompanies}
                placeholder="Search companies…"
                ariaLabel="Filter by company"
              />
            </label>
            <label className="ip-en-advanced__field">
              <span>Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-en-advanced__field">
              <span>Deadline</span>
              <select value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Filter by deadline">
                {DEADLINE_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-en-advanced__field">
              <span>When</span>
              <select value={whenWindow} onChange={(e) => setWhenWindow(e.target.value)} aria-label="Filter by when">
                {WHEN_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <div className="ip-en-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
          />
          {search ? (
            <button type="button" className="ip-en-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="w-full pt-2">
          <ListPresetsBar {...prefs} />
        </div>
      </div>

      {loading ? (
        <div className="ip-en-empty">
          <p>Loading notifications…</p>
        </div>
      ) : !items.length ? (
        <div className="ip-en-empty ip-en-empty--dash">
          <div className="ip-en-empty__icon">
            <BellOff size={22} aria-hidden />
          </div>
          <h3>You&apos;re all caught up</h3>
          <p>New applications, offer responses, and reward updates will show up here.</p>
        </div>
      ) : filtered.length ? (
        <>
        {viewMode === 'list' ? (
          <div className="ip-ph-list-wrap">
            <table className="ip-ph-list">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Title</th>
                  <th className="p-3">Summary</th>
                  <th className="p-3">When</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((n) => (
                  <tr key={n.id} className="border-b">
                    <td className="p-3">{n.title}</td>
                    <td className="p-3">{n.body ? <span className="line-clamp-2 text-xs text-slate-500">{n.body}</span> : '—'}</td>
                    <td className="p-3">{formatWhen(n.created_at)}</td>
                    <td className="p-3">{n.read_at ? 'Read' : 'Unread'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="ip-en-list">
            {pageItems.map((n) => {
              const unread = !n.read_at;
              const bucket = resolveBucket(n);
              const { Icon, tone } = iconFor(bucket);
              const action = actionFor(n, bucket);
              const href = n.resourceUnavailable ? null : n.link && n.link !== '#' ? n.link : null;
              const ActionIcon = action.Icon;
              return (
                <li key={n.id} className={`ip-en-card${unread ? ' ip-en-card--unread' : ''}`}>
                  <div className="ip-en-card-main">
                    <div className={`ip-en-icon ip-en-icon--${tone}`}>
                      <Icon size={20} aria-hidden />
                    </div>
                    <div className="ip-en-body">
                      <h3 className="ip-en-card-title">
                        <span>{n.title}</span>
                        {unread ? <span className="ip-en-dot" title="Unread" /> : null}
                      </h3>
                      {n.body ? <p className="ip-en-desc">{n.body}</p> : null}
                      {n.resourceUnavailable ? (
                        <p className="ip-en-desc">{n.resourceUnavailableMessage}</p>
                      ) : null}
                      <span className="ip-en-time">{formatWhen(n.created_at)}</span>
                    </div>
                  </div>
                  <div className="ip-en-card-actions">
                    {href ? (
                      <Link
                        href={href}
                        className="ip-en-cta"
                        onClick={() => {
                          if (unread) markRead(n.id);
                        }}
                      >
                        <ActionIcon size={14} aria-hidden />
                        <span>{action.label}</span>
                      </Link>
                    ) : (
                      <span className="ip-en-cta" style={{ opacity: 0.55, pointerEvents: 'none' }}>
                        <ActionIcon size={14} aria-hidden />
                        <span>{action.label}</span>
                      </span>
                    )}
                    {unread ? (
                      <button
                        type="button"
                        className="ip-en-icon-btn"
                        title="Mark as read"
                        onClick={() => markRead(n.id)}
                      >
                        <Check size={16} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {total > 0 ? (
          <IpTablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        ) : null}
        </>
      ) : (
        <div className="ip-en-empty">
          <div className="ip-en-empty__icon ip-en-empty__icon--muted">
            <SearchX size={22} aria-hidden />
          </div>
          <h3>No notifications found</h3>
          <p>No notifications match your filter criteria.</p>
          <button type="button" className="ip-en-empty-btn" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
