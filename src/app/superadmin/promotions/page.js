'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  Eye,
  Medal,
  Search,
  X,
  XCircle,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { LINKEDIN_PROMO_POINTS } from '@/lib/pointsEconomy';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function isPending(status) {
  return ['pending', 'fast_track_pending'].includes(String(status || ''));
}

function isVerified(status) {
  return ['verified', 'rewarded'].includes(String(status || ''));
}

function isRejected(status) {
  return status === 'failed';
}

function statusLabel(p, pts) {
  if (isVerified(p.status)) return `verified (+${p.points_awarded || pts} Pts)`;
  if (isRejected(p.status)) return 'rejected';
  if (p.status === 'fast_track_pending') return 'pending audit';
  return 'pending audit';
}

export default function SuperAdminPromotionsPage() {
  const [tab, setTab] = useState('all');
  const [items, setItems] = useState([]);
  const [pts, setPts] = useState(LINKEDIN_PROMO_POINTS);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [audit, setAudit] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [notes, setNotes] = useState('');

  async function load() {
    const res = await fetch('/api/ip/promotions?status=');
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to load');
      return;
    }
    setItems(data.items || []);
    if (data.economy?.LINKEDIN_PROMO_POINTS) setPts(data.economy.LINKEDIN_PROMO_POINTS);
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
    const pending = items.filter((p) => isPending(p.status)).length;
    const verified = items.filter((p) => isVerified(p.status)).length;
    const rejected = items.filter((p) => isRejected(p.status)).length;
    const pointsAwarded = items
      .filter((p) => isVerified(p.status))
      .reduce((sum, p) => sum + Number(p.points_awarded || pts), 0);
    return { total: items.length, pending, verified, rejected, pointsAwarded };
  }, [items, pts]);

  const filtered = useMemo(() => {
    let rows = items;
    if (tab === 'pending') rows = rows.filter((p) => isPending(p.status));
    if (tab === 'verified') rows = rows.filter((p) => isVerified(p.status));
    if (tab === 'rejected') rows = rows.filter((p) => isRejected(p.status));
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((p) =>
      [p.company_name, p.work_email, p.title, p.token, p.claimed_post_url]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, tab, search]);

  const pendingSelectable = filtered.filter((p) => isPending(p.status));

  async function act(ids, action, reviewNotes = '') {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/promotions/${ids[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, notes: reviewNotes }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Action failed');
      else {
        setToast(action === 'verify' ? `Verified ${data.processed || ids.length} claim(s)` : 'Claim rejected');
        setAudit(null);
        setRejectRow(null);
        setNotes('');
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
            <h1>LinkedIn Promos</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{counts.pending} Pending Verification</span>
          </div>
          <p>
            Audit, verify, or fast-track promotional post URLs submitted by recruiters on LinkedIn to release reward
            tokens and viral points.
          </p>
        </div>
        <button
          type="button"
          className="ip-saq-btn ip-saq-btn--emerald"
          disabled={!selected.length || busy}
          onClick={() => act(selected, 'verify')}
        >
          <CheckCheck size={15} aria-hidden />
          Bulk Verify Selected ({selected.length})
        </button>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Audit</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.pending}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Needs Action</span>
          </div>
          <p className="ip-saq-metric__sub">Awaiting SuperAdmin check</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Verified Tokens</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <Check size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.verified}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Approved</span>
          </div>
          <p className="ip-saq-metric__sub">Points credited to recruiters</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Points Awarded</span>
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
            <span>Rejected Claims</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <XCircle size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{counts.rejected}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Invalid Links</span>
          </div>
          <p className="ip-saq-metric__sub">Broken or fake URLs</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {[
              { id: 'all', label: `All (${counts.total})` },
              { id: 'pending', label: `Pending Audit (${counts.pending})` },
              { id: 'verified', label: `Verified (${counts.verified})` },
              { id: 'rejected', label: `Rejected (${counts.rejected})` },
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
          <div className="ip-saq-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search company, token, URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <Medal size={28} aria-hidden />
            <h4>No promotion claims in this view</h4>
            <p>Employer LinkedIn promo submissions will appear here.</p>
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
                        pendingSelectable.length > 0 && pendingSelectable.every((p) => selected.includes(p.id))
                      }
                      onChange={(e) =>
                        setSelected(e.target.checked ? pendingSelectable.map((p) => p.id) : [])
                      }
                    />
                  </th>
                  <th>Company &amp; Recruiter</th>
                  <th>Target Role</th>
                  <th>Promo Token</th>
                  <th>Claimed LinkedIn URL</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Audit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {isPending(p.status) ? (
                        <input
                          type="checkbox"
                          checked={selected.includes(p.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...new Set([...prev, p.id])] : prev.filter((x) => x !== p.id),
                            )
                          }
                        />
                      ) : null}
                    </td>
                    <td>
                      <div className="ip-saq-co">
                        <div className="ip-saq-avatar">{initial(p.company_name)}</div>
                        <div>
                          <strong>{p.company_name}</strong>
                          <span>{p.work_email || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td>{p.title || '—'}</td>
                    <td>
                      <span className="ip-saq-pill ip-saq-pill--blue" style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {p.token}
                      </span>
                    </td>
                    <td>
                      {p.claimed_post_url ? (
                        <a className="ip-saq-link" href={p.claimed_post_url} target="_blank" rel="noreferrer">
                          <ExternalLink size={12} aria-hidden />
                          Open post
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span
                        className={`ip-saq-pill ${
                          isVerified(p.status)
                            ? 'ip-saq-pill--ok'
                            : isRejected(p.status)
                              ? 'ip-saq-pill--danger'
                              : 'ip-saq-pill--warn'
                        }`}
                      >
                        {statusLabel(p, pts)}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setAudit(p)}>
                        <Eye size={14} aria-hidden />
                        Audit Claim
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
                  <h3>Audit promo claim</h3>
                  <span>{audit.token}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setAudit(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>Company</span>
                <strong>{audit.company_name}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Role</span>
                <strong>{audit.title}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>URL</span>
                <strong>
                  {audit.claimed_post_url ? (
                    <a className="ip-saq-link" href={audit.claimed_post_url} target="_blank" rel="noreferrer">
                      Open LinkedIn
                    </a>
                  ) : (
                    '—'
                  )}
                </strong>
              </div>
              {audit.review_notes ? (
                <div className="ip-saq-modal-row">
                  <span>Notes</span>
                  <strong>{audit.review_notes}</strong>
                </div>
              ) : null}
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setAudit(null)}>
                Close
              </button>
              {isPending(audit.status) ? (
                <>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    onClick={() => {
                      setRejectRow(audit);
                      setAudit(null);
                      setNotes('');
                    }}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--emerald"
                    disabled={busy}
                    onClick={() => act([audit.id], 'verify')}
                  >
                    Verify +{pts} Pts
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {rejectRow ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico ip-saq-modal__ico--rose">
                  <X size={18} aria-hidden />
                </div>
                <div>
                  <h3>Reject promo claim</h3>
                  <span>{rejectRow.token}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setRejectRow(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <textarea
                className="ip-saq-textarea"
                placeholder="Reason for rejection…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setRejectRow(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={busy}
                onClick={() => act([rejectRow.id], 'fail', notes || 'Invalid or broken URL')}
              >
                Reject claim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
