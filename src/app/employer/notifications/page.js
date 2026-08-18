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
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import '@/components/ip/ip-employer-notifications-gemini.css';

const TABS = ['All', 'Unread', 'Applications', 'Offers', 'Rewards'];

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
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(true);

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
    return items.filter((n) => {
      const bucket = resolveBucket(n);
      if (tab === 'Unread' && n.read_at) return false;
      if (tab === 'Applications' && bucket !== 'applications') return false;
      if (tab === 'Offers' && bucket !== 'offers') return false;
      if (tab === 'Rewards' && bucket !== 'rewards') return false;
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q);
    });
  }, [items, tab, search]);

  function resetFilters() {
    setTab('All');
    setSearch('');
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
      </div>

      <div className="ip-en-filters">
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
          <ul className="ip-en-list">
            {filtered.map((n) => {
              const unread = !n.read_at;
              const bucket = resolveBucket(n);
              const { Icon, tone } = iconFor(bucket);
              const action = actionFor(n, bucket);
              const href = n.link && n.link !== '#' ? n.link : null;
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
          <div className="ip-en-footer">
            <span>
              Showing {filtered.length} of {items.length} notifications
            </span>
            <span>Updated when you open this page</span>
          </div>
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
