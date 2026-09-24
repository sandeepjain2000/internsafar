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
  ChevronDown,
  ChevronRight,
  Coins,
  FileText,
  Gift,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles,
  Users,
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
import '@/components/ip/ip-employer-notifications-gemini.css';
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
  { value: 'rewards', label: 'Rewards' },
  { value: 'system', label: 'System' },
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

function countActiveCols(cols) {
  let n = 0;
  if (cols.category) n += 1;
  if (cols.read) n += 1;
  if (cols.dateFrom || cols.dateTo) n += 1;
  if (cols.timedOnly) n += 1;
  return n;
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

function isTimed(n, bucket) {
  return Boolean(
    bucket === 'offers' || /expir|deadline|accept/i.test(`${n.title || ''} ${n.body || ''}`),
  );
}

function categoryLabel(bucket) {
  const hit = CATEGORY_OPTIONS.find((o) => o.value === bucket);
  return hit?.label || 'System';
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
  const [search, setSearch] = useState('');
  const [cols, setCols] = useState(EMPTY_COLS);
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [presetResetKey, setPresetResetKey] = useState(0);
  const [viewMode, setViewMode] = useViewMode('ip_emp_notif_view', 'list');
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

  const displayMode = isPhone ? 'cards' : viewMode;

  const snapshot = useMemo(
    () => ({ filters: { search, cols }, sort: '' }),
    [search, cols],
  );
  const prefs = useListPrefsSync({
    tableKey: 'employer.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.search != null) setSearch(f.search);
      if (f.cols && typeof f.cols === 'object') {
        setCols({ ...EMPTY_COLS, ...f.cols });
      } else if (f.tab && f.tab !== 'All') {
        const legacy = String(f.tab);
        if (legacy === 'Unread') setCols((c) => ({ ...EMPTY_COLS, ...c, read: 'unread' }));
        else if (legacy === 'Applications') setCols((c) => ({ ...EMPTY_COLS, ...c, category: 'applications' }));
        else if (legacy === 'Offers') setCols((c) => ({ ...EMPTY_COLS, ...c, category: 'offers' }));
        else if (legacy === 'Rewards') setCols((c) => ({ ...EMPTY_COLS, ...c, category: 'rewards' }));
        else if (legacy === 'Time-limited') setCols((c) => ({ ...EMPTY_COLS, ...c, timedOnly: '1' }));
        else if (legacy === 'Last 24h') {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          setCols((c) => ({ ...EMPTY_COLS, ...c, dateFrom: d.toISOString().slice(0, 10) }));
        } else if (legacy === 'Last 7 days') {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          setCols((c) => ({ ...EMPTY_COLS, ...c, dateFrom: d.toISOString().slice(0, 10) }));
        }
      }
    },
  });

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

  const colsActive = countActiveCols(cols);

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
    return items.filter((n) => {
      const bucket = resolveBucket(n);
      if (cols.category && bucket !== cols.category) return false;
      const unread = !n.read_at;
      if (cols.read === 'unread' && !unread) return false;
      if (cols.read === 'read' && unread) return false;
      if (cols.timedOnly === '1' && !isTimed(n, bucket)) return false;
      if (!inDateRange(n.created_at, cols.dateFrom, cols.dateTo)) return false;
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''} ${bucket}`.toLowerCase().includes(q);
    });
  }, [items, search, cols]);

  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(
    filtered,
    PAGE_SIZE,
  );
  useEffect(() => {
    setPage(1);
  }, [search, cols, setPage]);

  function resetFilters() {
    setCols(EMPTY_COLS);
    setSearch('');
    setPresetResetKey((k) => k + 1);
  }

  function toggleExpand(n) {
    const next = expandedId === n.id ? null : n.id;
    setExpandedId(next);
    if (next && !n.read_at) {
      markRead(n.id);
    }
  }

  return (
    <div className="ip-emp-notif ip-mobile-bleed">
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
          <div className="ip-en-view-toggle">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
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
      </div>

      <div className="ip-en-desk-toolbar">
        <div className="ip-en-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications…"
            aria-label="Search notifications"
          />
          {search ? (
            <button type="button" className="ip-en-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
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
          {displayMode === 'list' ? (
            <div className="ip-ph-list-wrap ip-en-table-wrap">
              <table className="ip-ph-list">
                <thead>
                  <tr>
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
                    const unread = !n.read_at;
                    const bucket = resolveBucket(n);
                    const action = actionFor(n, bucket);
                    const href = n.resourceUnavailable ? null : n.link && n.link !== '#' ? n.link : null;
                    const sr = serialOffset + idx + 1;
                    return (
                      <tr key={n.id} className={unread ? 'is-unread' : undefined}>
                        <td>{sr}</td>
                        <td>
                          <button type="button" className="ip-en-table-title" onClick={() => toggleExpand(n)}>
                            {n.title || '—'}
                          </button>
                          {expandedId === n.id && n.body ? (
                            <p className="ip-en-table-body">{n.body}</p>
                          ) : null}
                        </td>
                        <td>{categoryLabel(bucket)}</td>
                        <td>{relativeTime(n.created_at)}</td>
                        <td>{unread ? 'Unread' : 'Read'}</td>
                        <td>
                          {href ? (
                            <Link
                              href={href}
                              className="ip-en-table-link"
                              onClick={() => {
                                if (unread) markRead(n.id);
                              }}
                            >
                              {action.label}
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
            <ul className="ip-en-list ip-en-list--compact">
              {pageItems.map((n, idx) => {
                const unread = !n.read_at;
                const bucket = resolveBucket(n);
                const { Icon, tone } = iconFor(bucket);
                const action = actionFor(n, bucket);
                const href = n.resourceUnavailable ? null : n.link && n.link !== '#' ? n.link : null;
                const ActionIcon = action.Icon;
                const open = expandedId === n.id;
                const sr = serialOffset + idx + 1;
                return (
                  <li key={n.id} className={`ip-en-row${unread ? ' is-unread' : ''}${open ? ' is-open' : ''}`}>
                    <span className="ip-en-sr" aria-hidden>
                      {sr}
                    </span>
                    <button
                      type="button"
                      className="ip-en-row__main"
                      onClick={() => toggleExpand(n)}
                      aria-expanded={open}
                    >
                      <div className={`ip-en-icon ip-en-icon--${tone}`}>
                        <Icon size={18} aria-hidden />
                      </div>
                      <div className="ip-en-row__text">
                        <div className="ip-en-row__title">
                          <h3>{n.title}</h3>
                        </div>
                        <div className="ip-en-row__meta">
                          <span className="ip-en-time">{relativeTime(n.created_at)}</span>
                          {unread ? (
                            <span className="ip-en-dot" title="Unread" />
                          ) : (
                            <span className="ip-en-read">Read</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className="ip-en-row__chev" aria-hidden />
                    </button>
                    {open ? (
                      <div className="ip-en-row__detail">
                        {n.body ? <p className="ip-en-desc">{n.body}</p> : null}
                        {n.resourceUnavailable ? (
                          <p className="ip-en-desc">{n.resourceUnavailableMessage}</p>
                        ) : null}
                        <div className="ip-en-row__actions">
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
                            <span />
                          )}
                          {unread ? (
                            <button type="button" className="ip-en-icon-btn" title="Mark as read" onClick={() => markRead(n.id)}>
                              <Check size={16} aria-hidden />
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
          <div className="ip-en-footer">
            <span>
              Showing {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)}` : 0} of {items.length}{' '}
              notifications
            </span>
            <span>Updated when you open this page</span>
          </div>
          {total > 0 ? (
            <IpListPager
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
