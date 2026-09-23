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
import '@/components/ip/ip-employer-notifications-gemini.css';
import '@/components/ip/ip-list-pager.css';

const PAGE_SIZE = 10;
const TABS = ['All', 'Unread', 'Applications', 'Offers', 'Rewards', 'Time-limited', 'Last 24h', 'Last 7 days'];

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
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const snapshot = useMemo(() => ({ filters: { tab, search }, sort: '' }), [tab, search]);
  const prefs = useListPrefsSync({
    tableKey: 'employer.notifications',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.tab) setTab(f.tab);
      if (f.search != null) setSearch(f.search);
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

  useEffect(() => {
    if (!filtersOpen) return undefined;
    document.body.classList.add('ip-scroll-locked');
    return () => document.body.classList.remove('ip-scroll-locked');
  }, [filtersOpen]);

  const filterActive = Boolean(search.trim()) || tab !== 'All';

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
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q);
    });
  }, [items, tab, search]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [tab, search, setPage]);

  function resetFilters() {
    setTab('All');
    setSearch('');
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

      {/* Mobile search + Filters */}
      <div className="ip-en-m-toolbar">
        <div className="ip-en-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            aria-label="Search notifications"
          />
          {search ? (
            <button type="button" className="ip-en-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X size={14} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={`ip-en-filters-btn${filterActive || filtersOpen ? ' is-on' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(true)}
        >
          Filters
          {filterActive ? <span className="ip-en-filters-chip">{tab !== 'All' ? tab : '1'}</span> : null}
        </button>
        <ListPresetsBar {...prefs} />
      </div>

      <div className="ip-en-filters ip-en-filters--desk">
        <div className="ip-en-tabs" role="tablist" aria-label="Notification filters">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`ip-en-tab${tab === t ? ' ip-en-tab--on' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
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

      {filtersOpen ? (
        <div className="ip-sheet is-open">
          <button
            type="button"
            className="ip-sheet-scrim"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="ip-sheet__panel" role="dialog" aria-label="Filter notifications">
            <div className="ip-sheet__handle" aria-hidden />
            <div className="ip-sheet__head">
              <h3 className="ip-sheet__title">Filters</h3>
              <button type="button" className="ip-sheet__x" onClick={() => setFiltersOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ip-sheet__body ip-en-sheet-body">
              <p className="ip-en-sheet-hint">Category</p>
              {TABS.map((t) => (
                <button
                  key={`sheet-${t}`}
                  type="button"
                  className={`ip-en-sheet-opt${tab === t ? ' is-on' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t}
                  {t === 'Unread' && unreadCount > 0 ? (
                    <span className="ip-en-filters-chip">{unreadCount}</span>
                  ) : null}
                </button>
              ))}
              <div className="ip-en-sheet-presets">
                <ListPresetsBar {...prefs} />
              </div>
            </div>
            <div className="ip-sheet__actions">
              <button
                type="button"
                className="ip-en-mark"
                onClick={() => {
                  resetFilters();
                  setFiltersOpen(false);
                }}
              >
                Reset
              </button>
              <button type="button" className="ip-en-cta" onClick={() => setFiltersOpen(false)}>
                Show {filtered.length}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
          <ul className="ip-en-list ip-en-list--compact">
            {pageItems.map((n) => {
              const unread = !n.read_at;
              const bucket = resolveBucket(n);
              const { Icon, tone } = iconFor(bucket);
              const action = actionFor(n, bucket);
              const href = n.resourceUnavailable ? null : n.link && n.link !== '#' ? n.link : null;
              const ActionIcon = action.Icon;
              const open = expandedId === n.id;
              return (
                <li key={n.id} className={`ip-en-row${unread ? ' is-unread' : ''}${open ? ' is-open' : ''}`}>
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
