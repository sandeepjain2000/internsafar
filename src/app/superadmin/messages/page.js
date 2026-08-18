'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Briefcase,
  Building2,
  Check,
  CheckCheck,
  Eye,
  Layers,
  Lightbulb,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';

const PAGE_SIZE = 10;

/** Classify live notifications into mock-style buckets without new DB fields. */
function classifyAlert(n) {
  const title = String(n.title || '').toLowerCase();
  const body = String(n.body || '').toLowerCase();
  const link = String(n.link || '').toLowerCase();
  const cat = String(n.category || '').toLowerCase();
  const blob = `${title} ${body} ${link} ${cat}`;

  if (
    /feature.?idea|idea submitted|\/ideas|feature-ideas/.test(blob) ||
    link.includes('/superadmin/feature-ideas') ||
    link.includes('/ideas')
  ) {
    return {
      tab: 'ideas',
      categoryLabel: 'Feature Request',
      Icon: Lightbulb,
      iconTone: 'amber',
    };
  }
  if (
    /employer|onboard|approval|manual request|domain mismatch|recruiter|document/.test(blob) ||
    link.includes('/superadmin/approvals') ||
    link.includes('/superadmin/requests') ||
    link.includes('/superadmin/documents') ||
    link.includes('/superadmin/form-registrations')
  ) {
    return {
      tab: 'employers',
      categoryLabel: /document|verification/.test(blob) ? 'Verification Docs' : 'Employer Onboarding',
      Icon: Building2,
      iconTone: 'indigo',
    };
  }
  return {
    tab: 'system',
    categoryLabel: 'System Log',
    Icon: ShieldAlert,
    iconTone: 'slate',
  };
}

function priorityFor(n) {
  const blob = `${n.title || ''} ${n.body || ''}`.toLowerCase();
  if (/domain mismatch|action required|urgent|flagged/.test(blob)) {
    return { label: 'High Priority', tone: 'warn' };
  }
  if (/verification|pending|approve|review/.test(blob) && !n.read_at) {
    return { label: 'Action Required', tone: 'brand' };
  }
  if (/audit|seed|system/.test(blob)) {
    return { label: 'Info', tone: 'slate' };
  }
  return { label: 'Routine', tone: 'blue' };
}

function actionLabel(n, cls) {
  if (cls.tab === 'ideas') return 'Inspect Feature Idea';
  if (cls.tab === 'employers') {
    if (/document|verification/.test(`${n.title} ${n.body}`.toLowerCase())) return 'Review Documents';
    return 'Review Employer Account';
  }
  return 'Open alert';
}

export default function SuperAdminMessagesPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, unresolved: 0, resolved: 0 });
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [inspect, setInspect] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  async function load() {
    setError('');
    const res = await fetch('/api/ip/notifications?meta=1');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to load');
      return;
    }
    setItems(data.items || []);
    if (data.meta) setMeta(data.meta);
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

  const enriched = useMemo(
    () =>
      items.map((n) => {
        const cls = classifyAlert(n);
        const priority = priorityFor(n);
        return {
          ...n,
          ...cls,
          priority,
          unresolved: !n.read_at,
          actionText: actionLabel(n, cls),
        };
      }),
    [items],
  );

  const kpi = useMemo(() => {
    const employers = enriched.filter((n) => n.tab === 'employers').length;
    const ideas = enriched.filter((n) => n.tab === 'ideas').length;
    const domainFlags = enriched.filter(
      (n) => n.tab === 'employers' && /domain mismatch/i.test(`${n.title} ${n.body}`),
    ).length;
    return {
      total: enriched.length,
      unresolved: enriched.filter((n) => n.unresolved).length,
      employers,
      ideas,
      domainFlags,
    };
  }, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (tab !== 'all') rows = rows.filter((n) => n.tab === tab);
    if (statusFilter === 'unresolved') rows = rows.filter((n) => n.unresolved);
    if (statusFilter === 'resolved') rows = rows.filter((n) => !n.unresolved);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((n) =>
        [n.title, n.body, n.categoryLabel].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [enriched, tab, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const unresolvedOnPage = pageItems.filter((n) => n.unresolved);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  async function resolveIds(ids) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Resolve failed');
      else {
        setToast(ids.length > 1 ? `Marked ${data.processed || ids.length} alerts resolved` : 'Alert marked as resolved');
        setInspect(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function markAllResolved() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed');
      else {
        setToast('All alerts marked resolved');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function openTarget(n) {
    if (n.link && n.link !== '#') router.push(n.link);
  }

  return (
    <div className="ip-sa-q">
      {toast ? (
        <div className="ip-saq-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Messages &amp; System Alerts</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{kpi.unresolved} Unresolved</span>
          </div>
          <p>Operational alerts, recruiter verification queues, and candidate feedback routed directly to SuperAdmin.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ip-saq-btn ip-saq-btn--icon" aria-label="Refresh" disabled={busy} onClick={load}>
            <RefreshCw size={15} />
          </button>
          <button type="button" className="ip-saq-btn" disabled={busy || !kpi.unresolved} onClick={markAllResolved}>
            <CheckCheck size={15} aria-hidden />
            Mark All Resolved
          </button>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total System Alerts</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <Bell size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.total}</strong>
            <span className="ip-saq-pill ip-saq-pill--blue">Logged Feed</span>
          </div>
          <p className="ip-saq-metric__sub">Recorded platform notification events</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Unresolved Triage</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <ShieldAlert size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.unresolved}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Requires Audit</span>
          </div>
          <p className="ip-saq-metric__sub">Pending administrative review</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Employer Onboarding</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <Briefcase size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.employers}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">
              {kpi.domainFlags ? `${kpi.domainFlags} Domain Flag` : 'Queue'}
            </span>
          </div>
          <p className="ip-saq-metric__sub">Recruiter verification events</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Feature Submissions</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <Lightbulb size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.ideas}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Community</span>
          </div>
          <p className="ip-saq-metric__sub">Ideas queued for product roadmap</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {[
              { id: 'all', label: 'All Alerts', Icon: Layers },
              { id: 'employers', label: 'Employer Approvals', Icon: Building2 },
              { id: 'ideas', label: 'Feature Ideas', Icon: Lightbulb },
              { id: 'system', label: 'System & Audit', Icon: ShieldAlert },
            ].map((t) => {
              const Icon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ip-saq-tab${tab === t.id ? ' ip-saq-tab--on' : ''}`}
                  onClick={() => {
                    setTab(t.id);
                    setPage(1);
                  }}
                >
                  <Icon size={14} aria-hidden />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              className="ip-saq-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Status filter"
            >
              <option value="all">All Statuses</option>
              <option value="unresolved">Unresolved</option>
              <option value="resolved">Resolved</option>
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search title, details..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            {selected.length ? (
              <button type="button" className="ip-saq-btn ip-saq-btn--emerald" disabled={busy} onClick={() => resolveIds(selected)}>
                <Check size={14} aria-hidden />
                Resolve selected ({selected.length})
              </button>
            ) : null}
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <Bell size={28} aria-hidden />
            <h4>No alerts in this view</h4>
            <p>Employer onboarding, feature ideas, and system notifications will appear here.</p>
          </div>
        ) : (
          <>
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select unresolved on page"
                        checked={
                          unresolvedOnPage.length > 0 && unresolvedOnPage.every((n) => selected.includes(n.id))
                        }
                        onChange={(e) =>
                          setSelected(e.target.checked ? unresolvedOnPage.map((n) => n.id) : [])
                        }
                      />
                    </th>
                    <th>Event Category</th>
                    <th>Alert Title &amp; Body</th>
                    <th>Priority</th>
                    <th>Timestamp</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((n) => {
                    const Icon = n.Icon;
                    return (
                      <tr key={n.id}>
                        <td>
                          {n.unresolved ? (
                            <input
                              type="checkbox"
                              checked={selected.includes(n.id)}
                              onChange={(e) =>
                                setSelected((prev) =>
                                  e.target.checked
                                    ? [...new Set([...prev, n.id])]
                                    : prev.filter((x) => x !== n.id),
                                )
                              }
                            />
                          ) : null}
                        </td>
                        <td>
                          <div className="ip-saq-co">
                            <div
                              className="ip-saq-avatar"
                              style={{
                                background:
                                  n.iconTone === 'amber'
                                    ? '#fffbeb'
                                    : n.iconTone === 'indigo'
                                      ? '#eef2ff'
                                      : '#f1f5f9',
                                color:
                                  n.iconTone === 'amber'
                                    ? '#d97706'
                                    : n.iconTone === 'indigo'
                                      ? '#4f46e5'
                                      : '#64748b',
                              }}
                            >
                              <Icon size={16} aria-hidden />
                            </div>
                            <strong style={{ fontSize: '0.75rem' }}>{n.categoryLabel}</strong>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                            {n.unresolved ? (
                              <span
                                aria-hidden
                                style={{
                                  width: 7,
                                  height: 7,
                                  marginTop: 6,
                                  borderRadius: 999,
                                  background: '#f59e0b',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <span style={{ width: 7, flexShrink: 0 }} />
                            )}
                            <div>
                              <strong style={{ display: 'block', color: '#0f172a' }}>{n.title}</strong>
                              <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>{n.body}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`ip-saq-pill ip-saq-pill--${n.priority.tone}`}>{n.priority.label}</span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.6875rem', color: '#64748b' }}>
                          {n.created_at ? new Date(n.created_at).toLocaleString() : '—'}
                        </td>
                        <td>
                          <div className="ip-saq-actions">
                            <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setInspect(n)}>
                              <Eye size={14} aria-hidden />
                              Inspect
                            </button>
                            {n.unresolved ? (
                              <button
                                type="button"
                                className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                                disabled={busy}
                                onClick={() => resolveIds([n.id])}
                              >
                                <Check size={14} aria-hidden />
                                Resolve
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.75rem',
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}{' '}
                system alerts
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="ip-saq-btn ip-saq-btn--sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page}/{totalPages}
                </span>
                <button
                  type="button"
                  className="ip-saq-btn ip-saq-btn--sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {inspect ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-msg-title">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Eye size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-msg-title">{inspect.title}</h3>
                  <span>
                    {inspect.categoryLabel} · {inspect.unresolved ? 'Unresolved' : 'Resolved'}
                  </span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setInspect(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>Priority</span>
                <strong>
                  <span className={`ip-saq-pill ip-saq-pill--${inspect.priority.tone}`}>{inspect.priority.label}</span>
                </strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>When</span>
                <strong>{inspect.created_at ? new Date(inspect.created_at).toLocaleString() : '—'}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', whiteSpace: 'pre-wrap' }}>
                {inspect.body || 'No additional details.'}
              </p>
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setInspect(null)}>
                Close
              </button>
              {inspect.unresolved ? (
                <button type="button" className="ip-saq-btn ip-saq-btn--emerald" disabled={busy} onClick={() => resolveIds([inspect.id])}>
                  Resolve
                </button>
              ) : null}
              {inspect.link && inspect.link !== '#' ? (
                <button
                  type="button"
                  className="ip-saq-btn"
                  style={{ background: '#4f46e5', color: '#fff', borderColor: '#4f46e5' }}
                  onClick={() => openTarget(inspect)}
                >
                  {inspect.actionText}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
