'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  Search,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { domainFromEmail, domainFromWebsite } from '@/lib/authRegisterRules';
import { employerDomainRisk, REJECT_PRESETS } from '@/lib/ipDomainRisk';

function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

function fmtDateParts(v) {
  if (!v) return { date: '—', time: '' };
  try {
    const d = new Date(v);
    return {
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  } catch {
    return { date: '—', time: '' };
  }
}

function websiteHref(url) {
  const w = String(url || '').trim();
  if (!w) return '';
  return w.startsWith('http') ? w : `https://${w}`;
}

export default function SuperAdminRequestsPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState('pending');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ pending: 0, approvedThisWeek: 0, rejected: 0 });
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [rejectPreset, setRejectPreset] = useState(REJECT_PRESETS[0]);
  const [rejectNote, setRejectNote] = useState('');

  async function load() {
    const statusQ = filter === 'all' ? '' : `status=${filter}&`;
    const res = await fetch(`/api/ip/superadmin/requests?${statusQ}meta=1`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to load');
      return;
    }
    setItems(data.items || []);
    if (data.meta) setMeta(data.meta);
  }

  useEffect(() => {
    if (session?.user?.role === 'superadmin') load();
  }, [session, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const enriched = useMemo(
    () =>
      items.map((r) => ({
        ...r,
        risk: employerDomainRisk({ email: r.contact_email, website: r.website }),
      })),
    [items],
  );

  const mismatchCount = useMemo(
    () => enriched.filter((r) => r.risk.key === 'mismatch').length,
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((r) =>
      [r.company_name, r.contact_email, r.contact_name, r.website, r.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [enriched, search]);

  async function process(id, status, rejectionReason) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, rejectionReason }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed');
      else {
        setToast(
          status === 'approved'
            ? 'Employer account created from request'
            : data.message || 'Request rejected',
        );
        setDetail(null);
        setRejectRow(null);
        setRejectNote('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function submitReject() {
    if (!rejectRow) return;
    const reason =
      rejectPreset === 'Other'
        ? rejectNote.trim()
        : rejectNote.trim()
          ? `${rejectPreset}: ${rejectNote.trim()}`
          : rejectPreset;
    if (!reason) {
      setError('Rejection reason is required');
      return;
    }
    process(rejectRow.id, 'rejected', reason);
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
            <h1>Manual Employer Requests</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{meta.pending || 0} Pending</span>
          </div>
          <p>
            Domain-mismatch and manual employer sign-ups. Approving creates a live employer account; rejecting notifies
            the contact with your reason.
          </p>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Queue</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.pending ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Pending Review</span>
          </div>
          <p className="ip-saq-metric__sub">Requests awaiting account creation</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Approved This Week</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <UserPlus size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.approvedThisWeek ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Accounts Created</span>
          </div>
          <p className="ip-saq-metric__sub">Converted to employer logins</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Domain Mismatch</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <AlertTriangle size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{mismatchCount}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Needs Review</span>
          </div>
          <p className="ip-saq-metric__sub">
            Employer submissions where the email domain does not match the company website.
          </p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Rejected</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <X size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.rejected ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--slate">Closed</span>
          </div>
          <p className="ip-saq-metric__sub">Requests not converted</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs" role="tablist">
            {[
              { id: 'pending', label: 'Pending', count: meta.pending },
              { id: 'approved', label: 'Approved', count: filter === 'approved' ? filtered.length : null },
              { id: 'rejected', label: 'Rejected', count: meta.rejected },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                className={`ip-saq-tab${filter === t.id ? ' ip-saq-tab--on' : ''}`}
                onClick={() => setFilter(t.id)}
              >
                {t.id === 'pending' ? <Clock size={14} aria-hidden /> : null}
                {t.id === 'approved' ? <Check size={14} aria-hidden /> : null}
                {t.id === 'rejected' ? <X size={14} aria-hidden /> : null}
                <span>{t.label}</span>
                {t.count != null ? <span className="ip-saq-tab__n">{t.count}</span> : null}
              </button>
            ))}
          </div>
          <div className="ip-saq-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search company, contact, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search manual requests"
            />
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <UserPlus size={28} aria-hidden />
            <h4>No {filter} manual requests</h4>
            <p>Domain-mismatch employer form submissions land here for account creation.</p>
          </div>
        ) : (
          <div className="ip-saq-table-wrap">
            <table className="ip-saq-table">
              <thead>
                <tr>
                  <th>Company &amp; Domain Details</th>
                  <th>Contact Person</th>
                  <th>Domain Mismatch Alert</th>
                  <th>Submitted</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const mailD = domainFromEmail(r.contact_email);
                  const webD = domainFromWebsite(r.website);
                  const mismatch = r.risk.key === 'mismatch';
                  const href = websiteHref(r.website);
                  const when = fmtDateParts(r.created_at);
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="ip-saq-co">
                          <div className="ip-saq-avatar">{initials(r.company_name)}</div>
                          <div>
                            <strong>
                              {r.company_name || '—'}
                              <span className="ip-saq-id">{r.id}</span>
                            </strong>
                            {href ? (
                              <a className="ip-saq-link" href={href} target="_blank" rel="noreferrer">
                                {webD || r.website}
                                <ExternalLink size={12} aria-hidden />
                              </a>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong style={{ display: 'block' }}>{r.contact_name || '—'}</strong>
                        <span style={{ color: '#64748b' }}>{r.contact_email}</span>
                      </td>
                      <td>
                        {mismatch ? (
                          <span className="ip-saq-alertchip ip-saq-alertchip--bad">
                            <AlertTriangle size={14} aria-hidden />
                            @{mailD || 'email'} ≠ {webD || 'website'}
                          </span>
                        ) : (
                          <span className="ip-saq-alertchip ip-saq-alertchip--ok">
                            <CheckCircle size={14} aria-hidden />
                            Domain Match Verified
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="ip-saq-subdate">
                          {when.date}
                          {when.time ? <small>{when.time}</small> : null}
                        </div>
                      </td>
                      <td>
                        <div className="ip-saq-actions">
                          <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setDetail(r)}>
                            Review Request
                          </button>
                          {r.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                                disabled={busy}
                                onClick={() => process(r.id, 'approved')}
                              >
                                <UserCheck size={14} aria-hidden />
                                Approve
                              </button>
                              <button
                                type="button"
                                className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                                disabled={busy}
                                aria-label="Reject"
                                onClick={() => {
                                  setRejectRow(r);
                                  setRejectPreset(REJECT_PRESETS[0]);
                                  setRejectNote('');
                                }}
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-req-title">
          <div className="ip-saq-modal ip-saq-modal--wide">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-avatar">{initials(detail.company_name)}</div>
                <div>
                  <h3 id="ip-saq-req-title">{detail.company_name || 'Request'}</h3>
                  <span>Registration Request #{detail.id}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              {detail.risk?.key === 'mismatch' ? (
                <div className="ip-saq-banner">
                  <AlertTriangle size={20} aria-hidden />
                  <div>
                    <strong>Domain Mismatch Requiring SuperAdmin Review</strong>
                    <p style={{ margin: 0 }}>
                      The applicant&apos;s email address @{domainFromEmail(detail.contact_email) || 'email'} does not
                      match the company website domain {domainFromWebsite(detail.website) || 'website'}.
                    </p>
                  </div>
                </div>
              ) : null}
              <div className="ip-saq-grid">
                <div>
                  <span>Contact Person</span>
                  <strong>{detail.contact_name || '—'}</strong>
                </div>
                <div>
                  <span>Official Email</span>
                  <strong>{detail.contact_email || '—'}</strong>
                </div>
                <div>
                  <span>Website URL</span>
                  {websiteHref(detail.website) ? (
                    <a href={websiteHref(detail.website)} target="_blank" rel="noreferrer">
                      {detail.website}
                    </a>
                  ) : (
                    <strong>—</strong>
                  )}
                </div>
              </div>
              {detail.status === 'approved' ? (
                <div className="ip-saq-statusnote ip-saq-statusnote--ok">
                  Approved. Live employer login account is active.
                </div>
              ) : null}
              {detail.status === 'rejected' && detail.rejection_reason ? (
                <div className="ip-saq-statusnote ip-saq-statusnote--off">
                  Rejected. Reason: {detail.rejection_reason}
                </div>
              ) : null}
            </div>
            <div className="ip-saq-modal-foot" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="ip-saq-btn" onClick={() => setDetail(null)}>
                Close
              </button>
              {detail.status === 'pending' ? (
                <div className="ip-saq-actions">
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    disabled={busy}
                    onClick={() => {
                      setRejectRow(detail);
                      setRejectPreset(REJECT_PRESETS[0]);
                      setRejectNote('');
                      setDetail(null);
                    }}
                  >
                    Reject Request
                  </button>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--emerald"
                    disabled={busy}
                    onClick={() => process(detail.id, 'approved')}
                  >
                    <UserCheck size={14} aria-hidden />
                    Approve &amp; Create Account
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {rejectRow ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-req-reject-title">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico ip-saq-modal__ico--rose">
                  <X size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-req-reject-title">Rejection reason</h3>
                  <span>Emailed to {rejectRow.contact_email}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setRejectRow(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <span className="ip-saq-label">Preset</span>
              <div className="ip-saq-presets">
                {REJECT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`ip-saq-preset${rejectPreset === p ? ' ip-saq-preset--on' : ''}`}
                    onClick={() => setRejectPreset(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div>
                <label className="ip-saq-label" htmlFor="ip-saq-req-reject-note">
                  Audit note
                </label>
                <textarea
                  id="ip-saq-req-reject-note"
                  className="ip-saq-textarea"
                  placeholder="Optional detail for the requester…"
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                />
              </div>
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setRejectRow(null)}>
                Cancel
              </button>
              <button type="button" className="ip-saq-btn ip-saq-btn--rose" disabled={busy} onClick={submitReject}>
                Reject &amp; notify
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
