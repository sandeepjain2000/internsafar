'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Briefcase,
  Check,
  Eye,
  Pause,
  Rocket,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function fmtDate(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function stipendLabel(n) {
  if (n == null || n === '') return '—';
  return `₹${Number(n).toLocaleString('en-IN')} / mo`;
}

export default function SuperAdminPostingsPage() {
  const [tab, setTab] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, published: 0, paused: 0, closed: 0 });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [inspect, setInspect] = useState(null);
  const [takedown, setTakedown] = useState(null);
  const [reason, setReason] = useState('');

  async function load() {
    const statusQ =
      tab === 'all' ? '' : `status=${tab === 'live' ? 'published' : tab === 'takedown' ? 'closed' : tab}&`;
    const res = await fetch(`/api/ip/superadmin/postings?${statusQ}meta=1`);
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
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const companies = useMemo(
    () => [...new Set(items.map((i) => i.company_name).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let rows = items;
    if (companyFilter !== 'all') rows = rows.filter((i) => i.company_name === companyFilter);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((i) =>
      [i.title, i.company_name, i.location, i.work_mode, i.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, search, companyFilter]);

  async function applyStatus(ids, status, moderationReason = '') {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/postings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status, reason: moderationReason }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Update failed');
      else {
        setToast(`Updated ${data.processed || ids.length} posting(s) → ${status}`);
        setInspect(null);
        setTakedown(null);
        setReason('');
        await load();
      }
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
            <h1>Posting Moderation</h1>
            <span className="ip-saq-pill ip-saq-pill--ok">{meta.published || 0} Live Published</span>
          </div>
          <p>Publish, pause, or take down active internship postings across all registered corporate accounts.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ip-saq-btn"
            disabled={!selected.length || busy}
            onClick={() => applyStatus(selected, 'paused', 'Bulk pause')}
          >
            <Pause size={15} aria-hidden />
            Pause Selected ({selected.length})
          </button>
          <button
            type="button"
            className="ip-saq-btn ip-saq-btn--emerald"
            disabled={!selected.length || busy}
            onClick={() => applyStatus(selected, 'published')}
          >
            <Rocket size={15} aria-hidden />
            Publish Selected
          </button>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total Postings</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <Briefcase size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.total ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--brand">All Roles</span>
          </div>
          <p className="ip-saq-metric__sub">Across all employers</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Live Published</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <Rocket size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.published ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Active Search</span>
          </div>
          <p className="ip-saq-metric__sub">Visible to candidates</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Paused Listings</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Pause size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.paused ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Hidden</span>
          </div>
          <p className="ip-saq-metric__sub">Temporarily paused</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Taken Down</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <AlertOctagon size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.closed ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Moderated</span>
          </div>
          <p className="ip-saq-metric__sub">Removed by admin</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {[
              { id: 'all', label: `All (${meta.total ?? 0})` },
              { id: 'live', label: `Live Published (${meta.published ?? 0})` },
              { id: 'paused', label: `Paused (${meta.paused ?? 0})` },
              { id: 'takedown', label: `Taken Down (${meta.closed ?? 0})` },
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
            <select
              className="ip-saq-select"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              aria-label="Company filter"
            >
              <option value="all">All Companies</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search posting title, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <Briefcase size={28} aria-hidden />
            <h4>No postings in this view</h4>
            <p>Employer internship listings will appear here for moderation.</p>
          </div>
        ) : (
          <div className="ip-saq-table-wrap">
            <table className="ip-saq-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((i) => selected.includes(i.id))}
                      onChange={(e) => setSelected(e.target.checked ? filtered.map((i) => i.id) : [])}
                    />
                  </th>
                  <th>Internship Role &amp; Title</th>
                  <th>Company</th>
                  <th>Applicants</th>
                  <th>Stipend &amp; Mode</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(i.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked ? [...new Set([...prev, i.id])] : prev.filter((x) => x !== i.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong style={{ display: 'block' }}>{i.title}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                        {i.work_mode || 'Role'} • Posted {fmtDate(i.created_at)}
                      </span>
                    </td>
                    <td>
                      <div className="ip-saq-co">
                        <div className="ip-saq-avatar">{initial(i.company_name)}</div>
                        <div>
                          <strong>{i.company_name}</strong>
                        </div>
                      </div>
                    </td>
                    <td>{i.applicant_count ?? 0}</td>
                    <td>
                      <strong style={{ display: 'block', color: '#4f46e5' }}>{stipendLabel(i.stipend_inr)}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                        {[i.location, i.work_mode].filter(Boolean).join(', ') || '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`ip-saq-pill ${
                          i.status === 'published'
                            ? 'ip-saq-pill--ok'
                            : i.status === 'paused'
                              ? 'ip-saq-pill--warn'
                              : i.status === 'closed'
                                ? 'ip-saq-pill--danger'
                                : 'ip-saq-pill--slate'
                        }`}
                      >
                        {i.status === 'closed' ? 'takedown' : i.status}
                      </span>
                    </td>
                    <td>
                      <div className="ip-saq-actions">
                        <button type="button" className="ip-saq-btn ip-saq-btn--icon" aria-label="Inspect" onClick={() => setInspect(i)}>
                          <Eye size={14} />
                        </button>
                        {i.status !== 'published' ? (
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--icon"
                            aria-label="Publish"
                            disabled={busy}
                            onClick={() => applyStatus([i.id], 'published')}
                          >
                            <Rocket size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--icon"
                            aria-label="Pause"
                            disabled={busy}
                            onClick={() => applyStatus([i.id], 'paused', 'Paused by SuperAdmin')}
                          >
                            <Pause size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                          aria-label="Take down"
                          disabled={busy}
                          onClick={() => {
                            setTakedown(i);
                            setReason('');
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inspect ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal ip-saq-modal--wide">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Briefcase size={18} aria-hidden />
                </div>
                <div>
                  <h3>{inspect.title}</h3>
                  <span>
                    {inspect.company_name} • Posted {fmtDate(inspect.created_at)}
                  </span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setInspect(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>Status</span>
                <strong>{inspect.status}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Stipend</span>
                <strong>{stipendLabel(inspect.stipend_inr)}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Location / mode</span>
                <strong>
                  {[inspect.location, inspect.work_mode].filter(Boolean).join(' · ') || '—'}
                </strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Applicants</span>
                <strong>{inspect.applicant_count ?? 0}</strong>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569', whiteSpace: 'pre-wrap' }}>
                {inspect.description || 'No description.'}
              </p>
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setInspect(null)}>
                Close
              </button>
              {inspect.status !== 'published' ? (
                <button
                  type="button"
                  className="ip-saq-btn ip-saq-btn--emerald"
                  disabled={busy}
                  onClick={() => applyStatus([inspect.id], 'published')}
                >
                  <Check size={14} aria-hidden /> Publish
                </button>
              ) : (
                <button
                  type="button"
                  className="ip-saq-btn"
                  disabled={busy}
                  onClick={() => applyStatus([inspect.id], 'paused', 'Paused by SuperAdmin')}
                >
                  <Pause size={14} aria-hidden /> Pause
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {takedown ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico ip-saq-modal__ico--rose">
                  <AlertOctagon size={18} aria-hidden />
                </div>
                <div>
                  <h3>Take Down Internship Posting</h3>
                  <span>{takedown.title}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setTakedown(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569' }}>
                Taking down this posting removes it from candidate search immediately.
              </p>
              <textarea
                className="ip-saq-textarea"
                placeholder="Moderation reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setTakedown(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={busy}
                onClick={() => applyStatus([takedown.id], 'closed', reason || 'Taken down by SuperAdmin')}
              >
                Confirm take down
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
