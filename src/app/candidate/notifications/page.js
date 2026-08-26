'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { normalizePrefsFilters, useListPrefsSync } from '@/hooks/useListPrefsSync';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import '@/components/ip/ip-candidate-notifications-gemini.css';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpTablePagination from '@/components/ip/IpTablePagination';

const PAGE_SIZE = 10;

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

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread', unreadDot: true },
  { id: 'applications', label: 'Applications', Icon: FileText },
  { id: 'offers', label: 'Offers', Icon: Award },
  { id: 'interviews', label: 'Interviews', Icon: Calendar },
  { id: 'messages', label: 'Messages', Icon: MessageSquare },
  { id: 'timed', label: 'Time-limited', Icon: Clock },
  { id: '24h', label: 'Last 24h', Icon: Clock },
  { id: '7d', label: 'Last 7 days', Icon: Clock },
  { id: '30d', label: 'Last 30 days', Icon: Clock },
  { id: 'referrals', label: 'Referrals', Icon: Share2 },
];

function relativeTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return 'Just now';
  if (sec < 3600) {
    const m = Math.max(1, Math.floor(sec / 60));
    return `${m} minute${m === 1 ? '' : 's'} ago`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  }
  if (sec < 86400 * 7) {
    const days = Math.floor(sec / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function iconFor(bucket) {
  if (bucket === 'offers') return Award;
  if (bucket === 'interviews') return Calendar;
  if (bucket === 'messages') return MessageSquare;
  if (bucket === 'applications') return FileText;
  if (bucket === 'referrals') return Share2;
  return Sparkles;
}

export default function CandidateNotificationsPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [titleQ, setTitleQ] = useState('');
  const [companies, setCompanies] = useState([]);
  const [priority, setPriority] = useState('');
  const [deadline, setDeadline] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewMode, setViewMode] = useViewMode('ip_cand_notif_view', 'cards');

  const snapshot = useMemo(
    () => ({
      filters: { filter, search, titleQ, companies, priority, deadline },
      sort: '',
    }),
    [filter, search, titleQ, companies, priority, deadline],
  );
  const prefs = useListPrefsSync({
    tableKey: 'candidate.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = normalizePrefsFilters(s?.filters);
      setFilter(f.filter != null && f.filter !== '' ? String(f.filter) : 'all');
      setSearch(f.search != null ? String(f.search) : '');
      setTitleQ(f.titleQ != null ? String(f.titleQ) : '');
      setCompanies(Array.isArray(f.companies) ? f.companies.map(String) : []);
      setPriority(f.priority != null ? String(f.priority) : '');
      setDeadline(f.deadline != null ? String(f.deadline) : '');
      if (
        (f.titleQ && String(f.titleQ).trim())
        || (Array.isArray(f.companies) && f.companies.length)
        || f.priority
        || f.deadline
      ) {
        setAdvancedOpen(true);
      }
    },
  });

  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0];
  const advancedActive = Boolean(
    titleQ.trim()
    || companies.length
    || priority
    || deadline,
  );
  const filtersActive = filter !== 'all' || Boolean(search.trim()) || advancedActive;

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

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  }

  async function load() {
    const res = await fetch('/api/ip/notifications');
    const data = await res.json().catch(() => null);
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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

  const unreadCount = items.filter((n) => n.isUnread || !n.read_at).length;

  const counts = useMemo(() => {
    const c = {
      all: items.length,
      unread: unreadCount,
      applications: 0,
      offers: 0,
      interviews: 0,
      messages: 0,
      referrals: 0,
    };
    items.forEach((n) => {
      const b = n.bucket || 'system';
      if (c[b] != null) c[b] += 1;
    });
    return c;
  }, [items, unreadCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const titleNeedle = titleQ.trim().toLowerCase();
    const companySet = new Set(companies.map((c) => String(c).toLowerCase()));
    return items.filter((n) => {
      if (filter === 'unread' && n.read_at) return false;
      if (filter === 'timed') {
        const timed =
          n.time_sensitive
          || n.priority === 'urgent'
          || n.priority === 'action_required'
          || Boolean(n.deadlineText);
        if (!timed) return false;
      } else if (filter === '24h' || filter === '7d' || filter === '30d') {
        const created = new Date(n.created_at).getTime();
        const hours = filter === '24h' ? 24 : filter === '7d' ? 24 * 7 : 24 * 30;
        if (Number.isNaN(created) || Date.now() - created > hours * 3600000) return false;
      } else if (filter !== 'all' && filter !== 'unread' && n.bucket !== filter) {
        return false;
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

      if (!q) return true;
      return `${n.title || ''} ${n.body || ''} ${n.company || ''} ${n.bucket || ''}`.toLowerCase().includes(q);
    });
  }, [items, filter, search, titleQ, companies, priority, deadline]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [filter, search, titleQ, companies, priority, deadline, setPage]);

  function resetFilters() {
    setFilter('all');
    setSearch('');
    setTitleQ('');
    setCompanies([]);
    setPriority('');
    setDeadline('');
    setFiltersOpen(false);
    setAdvancedOpen(false);
  }

  let emptyTitle = "You're all caught up.";
  let emptyDesc = 'There are no new updates or pending notifications for your account at this time.';
  if (filtersActive) {
    emptyTitle = 'No notifications found';
    emptyDesc = 'There are no notifications matching this search or filter.';
  }

  return (
    <div className="ip-cand-nf">
      {toast ? (
        <div className="ip-cn-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-cn-header">
        <div>
          <div className="ip-cn-title">
            <h1>Notifications</h1>
            {unreadCount > 0 ? <span className="ip-cn-unread">{unreadCount} unread</span> : null}
          </div>
          <p>Stay updated with application status, interview schedules, offers, and recruiter messages.</p>
        </div>
        <button type="button" className="ip-cn-btn" onClick={markAllRead} disabled={!unreadCount}>
          <CheckCheck aria-hidden />
          Mark all as read
        </button>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="ip-cn-toolbar">
        <div className="ip-cn-search-row">
          <div className="ip-cn-search">
            <Search aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications by keyword, company, or role..."
              aria-label="Search notifications"
            />
            {search ? (
              <button type="button" className="ip-cn-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <div className="ip-cn-showing">
            Showing:{' '}
            <strong style={{ color: '#0f172a' }}>
              {filtered.length} of {items.length} notifications
            </strong>
          </div>
        </div>

        <div className="ip-cn-filters-bar">
          <div className="ip-cn-filters-wrap">
            <button
              type="button"
              className={`ip-cn-filters-btn${filtersOpen || (filter !== 'all') ? ' is-on' : ''}`}
              aria-expanded={filtersOpen}
              aria-controls="ip-cn-filters-panel"
              onClick={() => {
                setFiltersOpen((v) => !v);
              }}
            >
              <SlidersHorizontal size={14} aria-hidden />
              <span>Filters</span>
              {filter !== 'all' ? <span className="ip-cn-filters-chip">{activeFilter.label}</span> : null}
            </button>
            {filtersOpen ? (
              <div id="ip-cn-filters-panel" className="ip-cn-filters-panel" role="listbox" aria-label="Notification filters">
                {FILTERS.map((f) => {
                  const Icon = f.Icon;
                  const count = counts[f.id];
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={filter === f.id}
                      className={filter === f.id ? 'is-on' : ''}
                      onClick={() => {
                        setFilter(f.id);
                      }}
                    >
                      {f.unreadDot ? <span className="ip-cn-dot" aria-hidden /> : null}
                      {Icon ? <Icon size={14} aria-hidden /> : null}
                      <span>{f.label}</span>
                      {count != null ? <span className="ip-cn-tab-count">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`ip-cn-filters-btn${advancedOpen || advancedActive ? ' is-on' : ''}`}
            aria-expanded={advancedOpen}
            aria-controls="ip-cn-advanced-panel"
            onClick={() => {
              setAdvancedOpen((v) => !v);
            }}
          >
            <SlidersHorizontal size={14} aria-hidden />
            <span>Advanced filters</span>
            {advancedActive ? <span className="ip-cn-filters-chip">On</span> : null}
          </button>
          {filtersActive ? (
            <button type="button" className="ip-cn-btn" onClick={resetFilters}>
              <RotateCcw size={14} aria-hidden />
              Reset
            </button>
          ) : null}
        </div>

        {advancedOpen ? (
          <div id="ip-cn-advanced-panel" className="ip-cn-advanced" role="region" aria-label="Advanced notification filters">
            <label className="ip-cn-advanced__field">
              <span>Title</span>
              <input
                type="search"
                value={titleQ}
                onChange={(e) => setTitleQ(e.target.value)}
                placeholder="Filter by title or body text…"
                aria-label="Filter by title"
              />
            </label>
            <label className="ip-cn-advanced__field">
              <span>Company</span>
              <SearchableMultiSelect
                options={companyOptions}
                value={companies}
                onChange={setCompanies}
                placeholder="Search companies…"
                ariaLabel="Filter by company"
              />
            </label>
            <label className="ip-cn-advanced__field">
              <span>Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Filter by priority">
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="ip-cn-advanced__field">
              <span>Deadline</span>
              <select value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Filter by deadline">
                {DEADLINE_OPTIONS.map((o) => (
                  <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <ListPresetsBar {...prefs} />
      </div>

      {loading ? (
        <div className="ip-cn-empty">
          <p>Loading notifications…</p>
        </div>
      ) : filtered.length ? (
        viewMode === 'list' ? (
          <div className="ip-ph-list-wrap">
            <table className="ip-ph-list">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Title</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Deadline</th>
                  <th className="p-3">When</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((n) => {
                  const unread = n.isUnread || !n.read_at;
                  return (
                  <tr key={n.id} className="border-b">
                    <td className="p-3">
                      <div className="font-medium">{n.title}</div>
                      {n.body ? <div className="text-xs text-slate-500 line-clamp-2">{n.body}</div> : null}
                    </td>
                    <td className="p-3">{n.company || '—'}</td>
                    <td className="p-3">
                      {n.priority === 'urgent'
                        ? 'Time-sensitive'
                        : n.priority === 'action_required'
                          ? 'Action Required'
                          : '—'}
                    </td>
                    <td className="p-3">{n.deadlineText || '—'}</td>
                    <td className="p-3">{relativeTime(n.created_at)}</td>
                    <td className="p-3">{unread ? 'Unread' : 'Read'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        {n.actionHref ? (
                          <Link
                            href={n.actionHref}
                            className="text-sm font-medium text-indigo-600 hover:underline"
                            onClick={() => {
                              if (unread) markRead(n.id);
                            }}
                          >
                            {n.actionLabel || 'View'}
                          </Link>
                        ) : null}
                        {unread ? (
                          <button
                            type="button"
                            className="ip-cn-btn"
                            onClick={() => markRead(n.id)}
                          >
                            Mark as read
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
        <ul className="ip-cn-list">
          {pageItems.map((n) => {
            const unread = n.isUnread || !n.read_at;
            const Icon = iconFor(n.bucket);
            return (
              <li key={n.id} className={`ip-cn-card${unread ? ' is-unread' : ''}`}>
                <div className="ip-cn-card-row">
                  <div className={`ip-cn-icon ip-cn-icon--${n.bucket || 'system'}`}>
                    <Icon size={20} aria-hidden />
                  </div>
                  <div className="ip-cn-body">
                    <div className="ip-cn-topline">
                      <div className="ip-cn-name">
                        <h3>{n.title}</h3>
                        {n.priority === 'urgent' ? (
                          <span className="ip-cn-badge ip-cn-badge--urgent">Time-sensitive</span>
                        ) : null}
                        {n.priority === 'action_required' ? (
                          <span className="ip-cn-badge ip-cn-badge--action">Action Required</span>
                        ) : null}
                        {n.company ? <span className="ip-cn-company">• {n.company}</span> : null}
                      </div>
                      <div className="ip-cn-meta">
                        {n.deadlineText ? (
                          <span className="ip-cn-deadline">
                            <Clock size={12} aria-hidden />
                            {n.deadlineText}
                          </span>
                        ) : null}
                        <span className="ip-cn-time">{relativeTime(n.created_at)}</span>
                        {unread ? (
                          <span className="ip-cn-unread-dot" title="Unread" />
                        ) : (
                          <span className="ip-cn-read">Read</span>
                        )}
                      </div>
                    </div>
                    {n.body ? <p className="ip-cn-desc">{n.body}</p> : null}
                    {n.resourceUnavailable ? (
                      <p className="ip-cn-desc">{n.resourceUnavailableMessage}</p>
                    ) : null}
                    <div className="ip-cn-actions">
                      {n.actionHref ? (
                        <Link
                          href={n.actionHref}
                          className="ip-cn-btn ip-cn-btn--primary"
                          onClick={() => {
                            if (unread) markRead(n.id);
                          }}
                        >
                          {n.actionLabel || 'View details'}
                          <ArrowRight size={14} aria-hidden />
                        </Link>
                      ) : (
                        <span />
                      )}
                      {unread ? (
                        <button type="button" className="ip-cn-mark" onClick={() => markRead(n.id)}>
                          <Check size={14} aria-hidden />
                          Mark as read
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        )
      ) : null}

      {!loading && total > 0 ? (
        <IpTablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}

      {!loading && !filtered.length ? (
        <div className="ip-cn-empty">
          <div className="ip-cn-empty__icon">
            <Inbox size={28} aria-hidden />
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyDesc}</p>
          {search || filter !== 'all' || advancedActive ? (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="ip-cn-btn" onClick={resetFilters}>
                <RotateCcw size={14} aria-hidden />
                Reset Filters & Search
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
