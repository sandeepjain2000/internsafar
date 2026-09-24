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
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import {
  IpDateRangeFilter,
  IpSingleSelectFilter,
  IpTableFiltersShell,
} from '@/components/ip/IpTableFiltersShell';
import '@/components/ip/ip-candidate-notifications-gemini.css';
import '@/components/ip/ip-table-filters.css';
import '@/components/ip/ip-list-pager.css';

const PAGE_SIZE = 10;

const EMPTY_COLS = {
  category: '',
  read: '',
  dateFrom: '',
  dateTo: '',
  timedOnly: '',
};

const CATEGORY_OPTIONS = [
  { value: 'applications', label: 'Applications' },
  { value: 'offers', label: 'Offers' },
  { value: 'interviews', label: 'Interviews' },
  { value: 'messages', label: 'Messages' },
  { value: 'referrals', label: 'Referrals' },
];

const READ_OPTIONS = [
  { value: 'unread', label: 'Unread only' },
  { value: 'read', label: 'Read only' },
];

const TIMED_OPTIONS = [{ value: '1', label: 'Time-limited only' }];

function dayKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inDateRange(value, from, to) {
  const key = dayKey(value);
  if (!key) return !(from || to);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function isTimed(n) {
  return Boolean(
    n.time_sensitive
      || n.bucket === 'offers'
      || n.bucket === 'interviews'
      || /expir|deadline|accept/i.test(`${n.title || ''} ${n.body || ''}`),
  );
}

function countActiveCols(cols) {
  let n = 0;
  if (cols.category) n += 1;
  if (cols.read) n += 1;
  if (cols.dateFrom || cols.dateTo) n += 1;
  if (cols.timedOnly) n += 1;
  return n;
}

function categoryLabel(bucket) {
  const hit = CATEGORY_OPTIONS.find((o) => o.value === bucket);
  return hit?.label || (bucket ? String(bucket) : 'System');
}

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
  const [search, setSearch] = useState('');
  const [cols, setCols] = useState(EMPTY_COLS);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [presetResetKey, setPresetResetKey] = useState(0);
  const [viewMode, setViewMode] = useViewMode('ip_cand_notif_view', 'list');
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setIsPhone(mq.matches);
    sync();
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  /** Phones always use cards; desktop keeps saved list/cards preference. */
  const displayMode = isPhone ? 'cards' : viewMode;

  const snapshot = useMemo(
    () => ({ filters: { search, cols }, sort: '' }),
    [search, cols],
  );
  const prefs = useListPrefsSync({
    tableKey: 'candidate.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.search != null) setSearch(f.search);
      if (f.cols && typeof f.cols === 'object') {
        setCols({ ...EMPTY_COLS, ...f.cols });
      } else if (f.filter && f.filter !== 'all') {
        // Migrate legacy tab-style presets
        const legacy = String(f.filter);
        if (legacy === 'unread' || legacy === 'read') {
          setCols((c) => ({ ...EMPTY_COLS, ...c, read: legacy === 'unread' ? 'unread' : 'read' }));
        } else if (['applications', 'offers', 'interviews', 'messages', 'referrals'].includes(legacy)) {
          setCols((c) => ({ ...EMPTY_COLS, ...c, category: legacy }));
        } else if (legacy === 'timed') {
          setCols((c) => ({ ...EMPTY_COLS, ...c, timedOnly: '1' }));
        }
      }
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
  const colsActive = countActiveCols(cols);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((n) => {
      if (cols.category && String(n.bucket || '') !== cols.category) return false;
      const unread = n.isUnread || !n.read_at;
      if (cols.read === 'unread' && !unread) return false;
      if (cols.read === 'read' && unread) return false;
      if (cols.timedOnly === '1' && !isTimed(n)) return false;
      if (!inDateRange(n.created_at, cols.dateFrom, cols.dateTo)) return false;
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''} ${n.company || ''} ${n.bucket || ''}`.toLowerCase().includes(q);
    });
  }, [items, search, cols]);

  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [search, cols, setPage]);

  function resetFilters() {
    setCols(EMPTY_COLS);
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
  if (search || colsActive) {
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
        <div className="ip-cn-header__actions">
          <div className="ip-cn-view-toggle">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
          <button type="button" className="ip-cn-btn" onClick={markAllRead} disabled={!unreadCount}>
            <CheckCheck aria-hidden />
            Mark all as read
          </button>
        </div>
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

        <ListPresetsBar {...prefs} selectionResetKey={presetResetKey} />
        <IpTableFiltersShell
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          activeCount={colsActive}
          onClear={resetFilters}
        >
          <IpSingleSelectFilter
            label="Category"
            options={CATEGORY_OPTIONS}
            value={cols.category}
            onChange={(category) => setCols((c) => ({ ...c, category }))}
            emptyLabel="Any category"
          />
          <IpSingleSelectFilter
            label="Read status"
            options={READ_OPTIONS}
            value={cols.read}
            onChange={(read) => setCols((c) => ({ ...c, read }))}
            emptyLabel="Any"
          />
          <IpSingleSelectFilter
            label="Urgency"
            options={TIMED_OPTIONS}
            value={cols.timedOnly}
            onChange={(timedOnly) => setCols((c) => ({ ...c, timedOnly }))}
            emptyLabel="Any"
          />
          <IpDateRangeFilter
            label="Received"
            from={cols.dateFrom}
            to={cols.dateTo}
            onFrom={(dateFrom) => setCols((c) => ({ ...c, dateFrom }))}
            onTo={(dateTo) => setCols((c) => ({ ...c, dateTo }))}
          />
        </IpTableFiltersShell>
      </div>

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

          {displayMode === 'list' ? (
            <div className="ip-ph-list-wrap ip-cn-table-wrap">
              <table className="ip-ph-list">
                <thead>
                  <tr>
                    <th className="ip-cn-th-check">
                      <span className="sr-only">Select</span>
                    </th>
                    <th>#</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Company</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((n, idx) => {
                    const unread = n.isUnread || !n.read_at;
                    const sr = serialOffset + idx + 1;
                    return (
                      <tr key={n.id} className={unread ? 'is-unread' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(n.id)}
                            onChange={() => toggleSelect(n.id)}
                            aria-label={`Select notification ${sr}`}
                          />
                        </td>
                        <td>{sr}</td>
                        <td>
                          <button type="button" className="ip-cn-table-title" onClick={() => toggleExpand(n)}>
                            {n.title || '—'}
                          </button>
                          {expandedId === n.id && n.body ? (
                            <p className="ip-cn-table-body">{n.body}</p>
                          ) : null}
                        </td>
                        <td>{categoryLabel(n.bucket)}</td>
                        <td>{n.company || '—'}</td>
                        <td>{relativeTime(n.created_at)}</td>
                        <td>{unread ? 'Unread' : 'Read'}</td>
                        <td>
                          {n.actionHref && !n.resourceUnavailable ? (
                            <Link href={n.actionHref} className="ip-cn-table-link" onClick={() => { if (unread) markRead(n.id); }}>
                              Open
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="ip-cn-list">
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
                          {n.company ? <span className="ip-cn-company">• {n.company}</span> : null}
                        </div>
                        <div className="ip-cn-row__meta">
                          <span className="ip-cn-time">{relativeTime(n.created_at)}</span>
                          {unread ? <span className="ip-cn-unread-dot" title="Unread" /> : <span className="ip-cn-read">Read</span>}
                        </div>
                      </div>
                      <ChevronDown className="ip-cn-row__chev" aria-hidden />
                    </button>
                    {open ? (
                      <div className="ip-cn-row__detail">
                        {n.body ? <p className="ip-cn-desc">{n.body}</p> : null}
                        <div className="ip-cn-actions">
                          {n.actionHref ? (
                            <Link href={n.actionHref} className="ip-cn-btn ip-cn-btn--primary" onClick={() => { if (unread) markRead(n.id); }}>
                              {n.actionLabel || 'View details'}
                              <ArrowRight size={14} aria-hidden />
                            </Link>
                          ) : <span />}
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
          )}
        </>
      ) : (
        <div className="ip-cn-empty">
          <div className="ip-cn-empty__icon">
            <Inbox size={28} aria-hidden />
          </div>
          <h3>{emptyTitle}</h3>
          <p>{emptyDesc}</p>
          {search || colsActive ? (
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
