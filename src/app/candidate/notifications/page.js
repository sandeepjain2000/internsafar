'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCheck,
  Inbox,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpListPager from '@/components/ip/IpListPager';
import {
  IpDateRangeFilter,
  IpSingleSelectFilter,
  IpTableFiltersShell,
  IP_RECEIVED_WINDOW_OPTIONS,
  inReceivedWindow,
} from '@/components/ip/IpTableFiltersShell';
import '@/components/ip/ip-candidate-notifications-gemini.css';
import '@/components/ip/ip-table-filters.css';
import '@/components/ip/ip-list-pager.css';

const PAGE_SIZE = 10;

const EMPTY_COLS = {
  category: '',
  read: '',
  when: '',
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
  if (cols.when) n += 1;
  if (cols.dateFrom || cols.dateTo) n += 1;
  if (cols.timedOnly) n += 1;
  return n;
}

function isNotificationUnread(n) {
  if (!n) return false;
  if (n.isUnread === true) return true;
  if (n.isUnread === false) return false;
  return n.read_at == null || n.read_at === '';
}

function categoryLabel(bucket) {
  const hit = CATEGORY_OPTIONS.find((o) => o.value === bucket);
  return hit?.label || (bucket ? String(bucket) : 'System');
}

const CONTEXT_PREVIEW_LEN = 96;

/** Second-line context: Employer · Internship (preferred). */
function candidateContextLine(n) {
  if (n.contextLine) return String(n.contextLine).trim();
  const employer = String(n.company || '').trim();
  const role = String(n.internshipTitle || '').trim();
  if (employer && role) return `${employer} · ${role}`;
  if (employer) return employer;
  if (role) return role;
  const bits = [];
  if (n.body) bits.push(String(n.body).trim());
  if (n.deadlineText && !bits.some((b) => b.includes(String(n.deadlineText)))) {
    bits.push(String(n.deadlineText).trim());
  }
  return bits.filter(Boolean).join(' · ');
}

function ContextPreview({ text, expanded, onToggle, moreClassName = 'ip-cn-context-more' }) {
  const full = String(text || '').trim();
  if (!full) return null;
  const needsMore = full.length > CONTEXT_PREVIEW_LEN;
  const preview = needsMore ? `${full.slice(0, CONTEXT_PREVIEW_LEN).trimEnd()}…` : full;
  return (
    <p className="ip-cn-table-context">
      <span>{expanded || !needsMore ? full : preview}</span>
      {needsMore ? (
        <button type="button" className={moreClassName} onClick={onToggle}>
          {expanded ? ' less' : ' or more'}
        </button>
      ) : null}
    </p>
  );
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
  const [markAllBusy, setMarkAllBusy] = useState(false);
  const [presetResetKey, setPresetResetKey] = useState(0);

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
        const legacy = String(f.filter);
        if (legacy === 'unread' || legacy === 'read') {
          setCols((c) => ({ ...EMPTY_COLS, ...c, read: legacy === 'unread' ? 'unread' : 'read' }));
        } else if (['applications', 'offers', 'interviews', 'messages', 'referrals'].includes(legacy)) {
          setCols((c) => ({ ...EMPTY_COLS, ...c, category: legacy }));
        } else if (legacy === 'timed') {
          setCols((c) => ({ ...EMPTY_COLS, ...c, timedOnly: '1' }));
        } else if (legacy === '24h' || /last\s*24/i.test(legacy)) {
          setCols((c) => ({ ...EMPTY_COLS, ...c, when: '24h' }));
        } else if (legacy === '7d' || /last\s*7/i.test(legacy)) {
          setCols((c) => ({ ...EMPTY_COLS, ...c, when: '7d' }));
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

  const unreadCount = items.filter(isNotificationUnread).length;
  const colsActive = countActiveCols(cols);

  async function markAllRead() {
    if (markAllBusy) return;
    if (!unreadCount) {
      showToast('All notifications are already read.');
      return;
    }
    setMarkAllBusy(true);
    try {
      const res = await fetch('/api/ip/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Could not mark notifications as read');
        return;
      }
      await load();
      showToast('All notifications marked as read.');
    } finally {
      setMarkAllBusy(false);
    }
  }

  async function markRead(id) {
    await fetch('/api/ip/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((n) => {
      if (cols.category && String(n.bucket || '') !== cols.category) return false;
      const unread = isNotificationUnread(n);
      if (cols.read === 'unread' && !unread) return false;
      if (cols.read === 'read' && unread) return false;
      if (cols.timedOnly === '1' && !isTimed(n)) return false;
      if (cols.when && !inReceivedWindow(n.created_at, cols.when)) return false;
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
    if (next && isNotificationUnread(n)) {
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
          <button
            type="button"
            className={`ip-cn-btn ip-cn-btn--mark-all${unreadCount ? '' : ' is-muted'}`}
            onClick={markAllRead}
            disabled={markAllBusy}
            aria-disabled={unreadCount === 0 && !markAllBusy ? 'true' : undefined}
            title={unreadCount ? `Mark ${unreadCount} unread as read` : 'Mark all as read'}
          >
            <CheckCheck aria-hidden />
            {markAllBusy ? 'Marking…' : 'Mark all as read'}
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
          <IpSingleSelectFilter
            label="Received"
            options={IP_RECEIVED_WINDOW_OPTIONS}
            value={cols.when}
            onChange={(when) => setCols((c) => ({ ...c, when }))}
            emptyLabel="Any time"
          />
          <IpDateRangeFilter
            label="Custom date range"
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
                    <th>When</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((n, idx) => {
                    const unread = isNotificationUnread(n);
                    const sr = serialOffset + idx + 1;
                    const open = expandedId === n.id;
                    const context = candidateContextLine(n);
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
                          <div className="ip-cn-table-title-block">
                            <span className="ip-cn-table-title">{n.title || '—'}</span>
                            <ContextPreview
                              text={context}
                              expanded={open}
                              onToggle={() => toggleExpand(n)}
                            />
                          </div>
                        </td>
                        <td>{categoryLabel(n.bucket)}</td>
                        <td>{relativeTime(n.created_at)}</td>
                        <td>{unread ? 'Unread' : 'Read'}</td>
                        <td>
                          {n.actionHref && !n.resourceUnavailable ? (
                            <Link
                              href={n.actionHref}
                              className="ip-cn-table-link"
                              onClick={() => { if (unread) markRead(n.id); }}
                            >
                              {n.actionLabel || 'Open'}
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
