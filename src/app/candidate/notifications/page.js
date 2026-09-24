'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Calendar,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  FileText,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpListPager from '@/components/ip/IpListPager';
import '@/components/ip/ip-candidate-notifications-gemini.css';
import '@/components/ip/ip-list-pager.css';

const PAGE_SIZE = 10;

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
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [presetResetKey, setPresetResetKey] = useState(0);

  const snapshot = useMemo(() => ({ filters: { filter, search }, sort: '' }), [filter, search]);
  const prefs = useListPrefsSync({
    tableKey: 'candidate.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.filter) setFilter(f.filter);
      if (f.search != null) setSearch(f.search);
    },
  });

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
    return items.filter((n) => {
      if (filter === 'unread' && n.read_at) return false;
      if (filter === 'timed') {
        const timed = n.time_sensitive || n.bucket === 'offers' || n.bucket === 'interviews' || /expir|deadline|accept/i.test(`${n.title} ${n.body}`);
        if (!timed) return false;
      } else if (filter === '24h' || filter === '7d' || filter === '30d') {
        const created = new Date(n.created_at).getTime();
        const hours = filter === '24h' ? 24 : filter === '7d' ? 24 * 7 : 24 * 30;
        if (Number.isNaN(created) || Date.now() - created > hours * 3600000) return false;
      } else if (filter !== 'all' && filter !== 'unread' && n.bucket !== filter) {
        return false;
      }
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''} ${n.company || ''} ${n.bucket || ''}`.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [filter, search, setPage]);

  function resetFilters() {
    setFilter('all');
    setSearch('');
    setPresetResetKey((k) => k + 1);
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPage() {
    const ids = pageItems.map((n) => n.id);
    const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/ip/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not delete notifications');
        return;
      }
      setSelected(new Set());
      await load();
      showToast(`Deleted ${data.deleted ?? ids.length} notification(s).`);
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleExpand(n) {
    const next = expandedId === n.id ? null : n.id;
    setExpandedId(next);
    if (next && (n.isUnread || !n.read_at)) {
      markRead(n.id);
    }
  }

  let emptyTitle = "You're all caught up.";
  let emptyDesc = 'There are no new updates or pending notifications for your account at this time.';
  if (search || filter !== 'all') {
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
      </div>

      <div className="ip-cn-toolbar">
        <div className="ip-cn-search-row">
          <div className="ip-cn-search">
            <Search aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications…"
              aria-label="Search notifications"
            />
            {search ? (
              <button type="button" className="ip-cn-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <X size={14} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className={`ip-cn-filters-btn${filtersOpen || filter !== 'all' ? ' is-on' : ''}`}
            onClick={() => setFiltersOpen(true)}
          >
            Filters
            {filter !== 'all' ? <span className="ip-cn-filters-chip">1</span> : null}
          </button>
          <div className="ip-cn-showing">
            Showing:{' '}
            <strong style={{ color: '#0f172a' }}>
              {total
                ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${items.length}`
                : `0 of ${items.length}`}{' '}
              notifications
            </strong>
          </div>
        </div>

        <div className="ip-cn-tabs ip-cn-tabs--desk" role="tablist" aria-label="Notification category">
          {FILTERS.map((f) => {
            const Icon = f.Icon;
            const count = counts[f.id] ?? 0;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={filter === f.id ? 'is-on' : ''}
                onClick={() => setFilter(f.id)}
              >
                {f.unreadDot ? <span className="ip-cn-dot" aria-hidden /> : null}
                {Icon ? <Icon size={14} aria-hidden /> : null}
                <span>{f.label}</span>
                {f.id === 'all' || f.id === 'unread' ? (
                  <span className="ip-cn-tab-count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <ListPresetsBar {...prefs} selectionResetKey={presetResetKey} />
      </div>

      {filtersOpen ? (
        <>
          <button
            type="button"
            className="ip-cn-sheet-scrim"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="ip-cn-sheet" role="dialog" aria-label="Filter notifications">
            <div className="ip-cn-sheet__handle" aria-hidden />
            <div className="ip-cn-sheet__head">
              <h3>Filters</h3>
              <button type="button" className="ip-cn-sheet__x" onClick={() => setFiltersOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ip-cn-sheet__body">
              {FILTERS.map((f) => {
                const Icon = f.Icon;
                const count = counts[f.id] ?? 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={filter === f.id ? 'is-on' : ''}
                    onClick={() => {
                      setFilter(f.id);
                      setFiltersOpen(false);
                    }}
                  >
                    {f.unreadDot ? <span className="ip-cn-dot" aria-hidden /> : null}
                    {Icon ? <Icon size={14} aria-hidden /> : null}
                    <span>{f.label}</span>
                    {f.id === 'all' || f.id === 'unread' || count > 0 ? (
                      <span className="ip-cn-tab-count">{count}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="ip-cn-sheet__actions">
              <button type="button" className="ip-cn-btn" onClick={() => { resetFilters(); setFiltersOpen(false); }}>
                Reset
              </button>
              <button type="button" className="ip-cn-btn ip-cn-btn--primary" onClick={() => setFiltersOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </>
      ) : null}

      {loading ? (
        <div className="ip-cn-empty">
          <p>Loading notifications…</p>
        </div>
      ) : filtered.length ? (
        <>
          <div className="ip-cn-bulk">
            <label className="ip-cn-bulk__all">
              <input
                type="checkbox"
                checked={pageItems.length > 0 && pageItems.every((n) => selected.has(n.id))}
                onChange={toggleSelectAllPage}
                aria-label="Select all on this page"
              />
              Select all
            </label>
            <button
              type="button"
              className="ip-cn-btn ip-cn-btn--danger"
              disabled={!selected.size || bulkBusy}
              onClick={deleteSelected}
            >
              {bulkBusy ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
          <ul className="ip-cn-list ip-cn-list--compact">
            {pageItems.map((n, idx) => {
              const unread = n.isUnread || !n.read_at;
              const Icon = iconFor(n.bucket);
              const open = expandedId === n.id;
              const sr = serialOffset + idx + 1;
              return (
                <li key={n.id} className={`ip-cn-row${unread ? ' is-unread' : ''}${open ? ' is-open' : ''}`}>
                  <div className="ip-cn-row__select">
                    <span className="ip-cn-sr" aria-hidden>{sr}</span>
                    <input
                      type="checkbox"
                      checked={selected.has(n.id)}
                      onChange={() => toggleSelect(n.id)}
                      aria-label={`Select notification ${sr}`}
                    />
                  </div>
                  <button
                    type="button"
                    className="ip-cn-row__main"
                    onClick={() => toggleExpand(n)}
                    aria-expanded={open}
                  >
                    <div className={`ip-cn-icon ip-cn-icon--${n.bucket || 'system'}`}>
                      <Icon size={18} aria-hidden />
                    </div>
                    <div className="ip-cn-row__text">
                      <div className="ip-cn-row__title">
                        <h3>{n.title}</h3>
                        {n.priority === 'urgent' ? (
                          <span className="ip-cn-badge ip-cn-badge--urgent">Time-sensitive</span>
                        ) : null}
                        {n.priority === 'action_required' ? (
                          <span className="ip-cn-badge ip-cn-badge--action">Action required</span>
                        ) : null}
                        {n.company ? <span className="ip-cn-company">• {n.company}</span> : null}
                      </div>
                      <div className="ip-cn-row__meta">
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
                    <ChevronDown className="ip-cn-row__chev" aria-hidden />
                  </button>
                  {open ? (
                    <div className="ip-cn-row__detail">
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
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="ip-cn-empty">
          <div className="ip-cn-empty__icon">
            <Inbox size={28} aria-hidden />
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyDesc}</p>
          {search || filter !== 'all' ? (
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="ip-cn-btn" onClick={resetFilters}>
                <RotateCcw size={14} aria-hidden />
                Reset Filters & Search
              </button>
            </div>
          ) : null}
        </div>
      )}

      {!loading && total > 0 ? (
        <IpListPager
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
