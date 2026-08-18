'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BellOff,
  Calendar,
  Check,
  CheckCheck,
  FileCheck,
  Gift,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import '@/components/ip/ip-notifications-gemini.css';

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

/** Infer category for legacy rows that predate the category column. */
function resolveCategory(n) {
  const stored = String(n.category || '').toLowerCase();
  if (stored === 'application' || stored === 'referral' || stored === 'system') return stored;
  const blob = `${n.title || ''} ${n.body || ''} ${n.link || ''}`.toLowerCase();
  if (blob.includes('referral') || blob.includes('/referral')) return 'referral';
  if (
    blob.includes('application') ||
    blob.includes('applicant') ||
    blob.includes('offer') ||
    blob.includes('/applications') ||
    blob.includes('/offers') ||
    blob.includes('/internships')
  ) {
    return 'application';
  }
  return 'system';
}

function actionLabel(n, category) {
  const link = String(n.link || '');
  if (link.includes('/applications')) return 'View Application';
  if (link.includes('/offers')) return 'View Offer';
  if (link.includes('/referral')) return 'Check Points Balance';
  if (link.includes('/messages')) return 'Open Messages';
  if (link.includes('/internships')) return 'Browse Internships';
  if (category === 'referral') return 'Check Points Balance';
  if (category === 'application') return 'View details';
  return 'View details';
}

function iconFor(n, category) {
  const title = String(n.title || '').toLowerCase();
  if (category === 'referral') return { Icon: Gift, tone: 'referral' };
  if (title.includes('interview') || title.includes('invite')) return { Icon: Calendar, tone: 'application' };
  if (category === 'application') return { Icon: FileCheck, tone: 'application' };
  return { Icon: Sparkles, tone: 'system' };
}

/** Shared notifications list — candidate + employer (content chrome from Gemini mock). */
export default function IpNotificationsInbox() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toastMsg, setToastMsg] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch('/api/ip/notifications');
    const data = await res.json();
    setItems(data.items || []);
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
      const category = resolveCategory(n);
      if (filter === 'unread' && n.read_at) return false;
      if (filter === 'applications' && category !== 'application') return false;
      if (filter === 'referrals' && category !== 'referral') return false;
      if (!q) return true;
      return `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q);
    });
  }, [items, filter, search]);

  return (
    <div className="ip-notif">
      {toastMsg ? (
        <div className="ip-nf-toast" role="status">
          <span className="ip-nf-toast-ico">
            <Check aria-hidden />
          </span>
          <span>{toastMsg}</span>
        </div>
      ) : null}

      <div className="ip-nf-header">
        <div>
          <div className="ip-nf-title-row">
            <h1>Notifications</h1>
            {unreadCount > 0 ? <span className="ip-nf-new">{unreadCount} new</span> : null}
          </div>
          <p>Stay updated with your internship applications, interview requests, and account alerts.</p>
        </div>
        <button type="button" className="ip-nf-mark" onClick={markAllRead} disabled={!unreadCount}>
          <CheckCheck aria-hidden />
          <span>Mark all as read</span>
        </button>
      </div>

      <div className="ip-nf-toolbar">
        <div className="ip-nf-tabs" role="tablist" aria-label="Notification filters">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`ip-nf-tab${filter === 'all' ? ' is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'unread'}
            className={`ip-nf-tab${filter === 'unread' ? ' is-active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            <span>Unread</span>
            {unreadCount > 0 ? <span className="ip-nf-tab-dot" aria-hidden /> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'applications'}
            className={`ip-nf-tab${filter === 'applications' ? ' is-active' : ''}`}
            onClick={() => setFilter('applications')}
          >
            Applications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'referrals'}
            className={`ip-nf-tab${filter === 'referrals' ? ' is-active' : ''}`}
            onClick={() => setFilter('referrals')}
          >
            Referrals
          </button>
        </div>

        <div className="ip-nf-search">
          <Search className="ip-nf-search-ico" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notifications..."
            aria-label="Search notifications"
          />
          {search ? (
            <button type="button" className="ip-nf-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              <X aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="ip-nf-empty">
          <p>Loading notifications…</p>
        </div>
      ) : filtered.length > 0 ? (
        <ul className="ip-nf-list">
          {filtered.map((n) => {
            const unread = !n.read_at;
            const category = resolveCategory(n);
            const { Icon, tone } = iconFor(n, category);
            const cta = actionLabel(n, category);
            const href = n.link && n.link !== '#' ? n.link : null;
            return (
              <li key={n.id} className={`ip-nf-card${unread ? ' is-unread' : ''}`}>
                <div className="ip-nf-card-main">
                  <div className={`ip-nf-icon ip-nf-icon--${tone}`}>
                    <Icon aria-hidden />
                  </div>
                  <div className="ip-nf-body">
                    <h3 className="ip-nf-card-title">
                      <span>{n.title}</span>
                      {unread ? <span className="ip-nf-unread-dot" title="Unread" /> : null}
                    </h3>
                    {n.body ? <p className="ip-nf-desc">{n.body}</p> : null}
                    <div className="ip-nf-meta">
                      {href ? (
                        <Link
                          href={href}
                          className="ip-nf-cta"
                          onClick={() => {
                            if (unread) markRead(n.id);
                          }}
                        >
                          <span>{cta}</span>
                          <ArrowRight aria-hidden />
                        </Link>
                      ) : null}
                      {href ? <span className="ip-nf-sep">•</span> : null}
                      <span className="ip-nf-time">{formatWhen(n.created_at)}</span>
                    </div>
                  </div>
                </div>
                {unread ? (
                  <div className="ip-nf-actions">
                    <button
                      type="button"
                      className="ip-nf-action"
                      title="Mark as read"
                      onClick={() => markRead(n.id)}
                    >
                      <Check aria-hidden />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ip-nf-empty">
          <div className="ip-nf-empty-ico">
            <BellOff aria-hidden />
          </div>
          <div>
            <h3>No notifications found</h3>
            <p>
              {search
                ? `No results matching "${search}". Try clearing your search.`
                : "You're all caught up! Check back later for application updates and announcements."}
            </p>
          </div>
          {search ? (
            <button type="button" className="ip-nf-empty-btn" onClick={() => setSearch('')}>
              Clear Search
            </button>
          ) : null}
        </div>
      )}

      {!loading && filtered.length > 0 ? (
        <div className="ip-nf-footer">
          <span>
            Showing {filtered.length} of {items.length} notifications
          </span>
          <span>Updated when you open this page</span>
        </div>
      ) : null}
    </div>
  );
}
