'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  ExternalLink,
  Eye,
  Flag,
  Medal,
  Play,
  RefreshCw,
  Search,
  Zap,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function isPending(status) {
  return ['pending', 'scheduled', 'fast_track_pending', 'searching'].includes(String(status || ''));
}

function isVerified(status) {
  return ['verified', 'rewarded'].includes(String(status || ''));
}

function isFlagged(status) {
  return status === 'failed';
}

function scheduleLabel(s) {
  if (isVerified(s.status)) {
    return s.search_notes?.includes('Fast') || s.search_notes?.includes('SuperAdmin')
      ? 'Completed (Fast-Tracked)'
      : 'Completed (Auto-Verified)';
  }
  if (isFlagged(s.status)) return s.search_notes || 'Flagged (Post Deleted / 404)';
  if (s.check_after) {
    const ms = new Date(s.check_after).getTime() - Date.now();
    if (ms > 0) {
      const h = Math.max(1, Math.round(ms / 3600000));
      return `In ~${h} hours (Google Search)`;
    }
    return 'Due now (Google Search)';
  }
  return 'Awaiting review';
}

export default function SuperAdminViralPage() {
  const [tab, setTab] = useState('all');
  const [channel, setChannel] = useState('all');
  const [items, setItems] = useState([]);
  const [pts, setPts] = useState(LINKEDIN_PROMO_POINTS);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [audit, setAudit] = useState(null);

  async function load() {
    const res = await fetch('/api/ip/viral');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to load');
      return;
    }
    setItems(data.items || []);
    if (data.rewardPreview?.points) setPts(data.rewardPreview.points);
    setSelected([]);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const counts = useMemo(() => {
    const pending = items.filter((s) => isPending(s.status)).length;
    const verified = items.filter((s) => isVerified(s.status)).length;
    const flagged = items.filter((s) => isFlagged(s.status)).length;
    const pointsAwarded = items
      .filter((s) => isVerified(s.status))
      .reduce((sum, s) => sum + Number(s.points_awarded || pts), 0);
    return { total: items.length, pending, verified, flagged, pointsAwarded };
  }, [items, pts]);

  const filtered = useMemo(() => {
    let rows = items;
    if (tab === 'pending') rows = rows.filter((s) => isPending(s.status));
    if (tab === 'verified') rows = rows.filter((s) => isVerified(s.status));
    if (tab === 'flagged') rows = rows.filter((s) => isFlagged(s.status));
    if (channel !== 'all') rows = rows.filter((s) => String(s.channel).toLowerCase() === channel);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) =>
      [s.user_name, s.email, s.company_name, s.share_url, s.claimed_post_url, s.channel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, tab, channel, search]);

  const pendingSelectable = filtered.filter((s) => isPending(s.status));

  async function act(id, action) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/viral/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          notes: action === 'fail' ? 'Flagged by SuperAdmin' : 'Fast-tracked by SuperAdmin',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Action failed');
      else {
        setToast(action === 'verify' ? 'Share verified + points credited' : action === 'fail' ? 'Share flagged' : 'Search ran');
        setAudit(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function bulkFastTrack() {
    if (!selected.length) return;
    setBusy(true);
    try {
      for (const id of selected) {
        await fetch(`/api/ip/viral/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify', notes: 'Bulk fast-track by SuperAdmin' }),
        });
      }
      setToast(`Fast-tracked ${selected.length} share(s)`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function processDue() {
    setBusy(true);
    try {
      const res = await fetch('/api/ip/viral/process-due', { method: 'POST' });
      const data = await res.json();
      setToast(`Processed ${data.processed || 0} due share(s)`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ip-sa-q">
      {toast ? <div className="ip-saq-toast" role="status">{toast}</div> : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Viral LinkedIn Shares</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{counts.pending} Pending Queue</span>
          </div>
          <p>Verify scheduled Google searches (~24h) or fast-track viral social media share claims to release reward points.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ip-saq-btn" style={{ background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }} disabled={busy} onClick={processDue}>
            <Play size={15} aria-hidden />
            Run due checks now
          </button>
          <button type="button" className="ip-saq-btn" disabled={!selected.length || busy} onClick={bulkFastTrack}>
            <Zap size={15} aria-hidden />
            Fast-Track Selected ({selected.length})
          </button>
          <button type="button" className="ip-saq-btn ip-saq-btn--icon" aria-label="Refresh" disabled={busy} onClick={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Checks</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.pending}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Needs Action</span>
          </div>
          <p className="ip-saq-metric__sub">Scheduled Google indexing</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Verified Shares</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <Check size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.verified}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Verified</span>
          </div>
          <p className="ip-saq-metric__sub">Social shares confirmed</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Bonus Points Issued</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <Medal size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>+{counts.pointsAwarded}</strong>
            <span className="ip-saq-pill ip-saq-pill--brand">Total Pts</span>
          </div>
          <p className="ip-saq-metric__sub">+{pts} Pts per verified share</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Flagged Links</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <Flag size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.flagged}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Invalid</span>
          </div>
          <p className="ip-saq-metric__sub">Deleted or broken links</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {[
              { id: 'all', label: `All (${counts.total})` },
              { id: 'pending', label: `Pending (${counts.pending})` },
              { id: 'verified', label: `Verified (${counts.verified})` },
              { id: 'flagged', label: `Flagged (${counts.flagged})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ip-saq-tab${tab === t.id ? ' ip-saq-tab--on' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select className="ip-saq-select" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
              <option value="all">All Channels</option>
              <option value="linkedin">LinkedIn</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="twitter">Twitter</option>
              <option value="other">Other</option>
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search user, company, URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <Zap size={28} aria-hidden />
            <h4>No viral shares in this view</h4>
            <p>Scheduled and fast-track share claims will appear here.</p>
          </div>
        ) : (
          <div className="ip-saq-table-wrap">
            <table className="ip-saq-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={
                        pendingSelectable.length > 0 && pendingSelectable.every((s) => selected.includes(s.id))
                      }
                      onChange={(e) =>
                        setSelected(e.target.checked ? pendingSelectable.map((s) => s.id) : [])
                      }
                    />
                  </th>
                  <th>User &amp; Account</th>
                  <th>Channel</th>
                  <th>Claimed Share URL</th>
                  <th>Scheduled Check</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {isPending(s.status) ? (
                        <input
                          type="checkbox"
                          checked={selected.includes(s.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...new Set([...prev, s.id])] : prev.filter((x) => x !== s.id),
                            )
                          }
                        />
                      ) : null}
                    </td>
                    <td>
                      <div className="ip-saq-co">
                        <div className="ip-saq-avatar">{initial(s.user_name || s.email)}</div>
                        <div>
                          <strong>@{String(s.email || s.user_name || '').split('@')[0]}</strong>
                          <span>{s.company_name || s.email || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ip-saq-pill ip-saq-pill--blue">{s.channel}</span>
                    </td>
                    <td>
                      <a
                        className="ip-saq-link"
                        href={s.claimed_post_url || s.share_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={12} aria-hidden />
                        Open link
                      </a>
                    </td>
                    <td style={{ fontSize: '0.6875rem', color: '#64748b' }}>{scheduleLabel(s)}</td>
                    <td>
                      <span
                        className={`ip-saq-pill ${
                          isVerified(s.status)
                            ? 'ip-saq-pill--ok'
                            : isFlagged(s.status)
                              ? 'ip-saq-pill--danger'
                              : 'ip-saq-pill--warn'
                        }`}
                      >
                        {isVerified(s.status)
                          ? `verified (+${s.points_awarded || pts} Pts)`
                          : isFlagged(s.status)
                            ? 'flagged'
                            : 'pending check'}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setAudit(s)}>
                        <Eye size={14} aria-hidden />
                        Audit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {audit ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Eye size={18} aria-hidden />
                </div>
                <div>
                  <h3>Audit viral share</h3>
                  <span>{audit.email}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setAudit(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>Channel</span>
                <strong>{audit.channel}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Status</span>
                <strong>{audit.status}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Schedule</span>
                <strong>{scheduleLabel(audit)}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>URL</span>
                <strong>
                  <a className="ip-saq-link" href={audit.claimed_post_url || audit.share_url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </strong>
              </div>
              {audit.search_notes ? (
                <div className="ip-saq-modal-row">
                  <span>Notes</span>
                  <strong>{audit.search_notes}</strong>
                </div>
              ) : null}
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setAudit(null)}>
                Close
              </button>
              {isPending(audit.status) ? (
                <>
                  <button type="button" className="ip-saq-btn" disabled={busy} onClick={() => act(audit.id, 'run_search')}>
                    Run search
                  </button>
                  <button type="button" className="ip-saq-btn ip-saq-btn--rose" disabled={busy} onClick={() => act(audit.id, 'fail')}>
                    Flag
                  </button>
                  <button type="button" className="ip-saq-btn ip-saq-btn--emerald" disabled={busy} onClick={() => act(audit.id, 'verify')}>
                    Fast-track +{pts}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
