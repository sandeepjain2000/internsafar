'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  FileSearch,
  Search,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { employerDomainRisk, REJECT_PRESETS } from '@/lib/ipDomainRisk';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function formatHours(h) {
  if (h == null || Number.isNaN(Number(h))) return '—';
  return `${Number(h).toFixed(1)}h`;
}

export default function SuperAdminApprovalsPage() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState('pending');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ pending: 0, approvedThisWeek: 0, rejected: 0, avgTriageHours: null });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [auditRow, setAuditRow] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [rejectPreset, setRejectPreset] = useState(REJECT_PRESETS[0]);
  const [rejectNote, setRejectNote] = useState('');

  async function load() {
    const res = await fetch(`/api/ip/superadmin/employers?status=${filter}&meta=1`);
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
    if (session?.user?.role === 'superadmin') load();
  }, [session, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const enriched = useMemo(
    () =>
      items.map((e) => {
        const email = e.work_email || e.account_email || '';
        const risk = employerDomainRisk({ email, website: e.website });
        return { ...e, email, risk };
      }),
    [items],
  );

  const mismatchCount = useMemo(
    () => enriched.filter((e) => e.risk.key === 'mismatch').length,
    [enriched],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((e) =>
      [e.company_name, e.email, e.website, e.contact_name, e.account_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [enriched, search]);

  async function patchStatus(ids, approvalStatus, rejectionReason) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/employers/${ids[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          approvalStatus,
          rejectionReason: rejectionReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Update failed');
      else {
        setToast(
          approvalStatus === 'approved'
            ? `Approved ${data.processed || ids.length} employer(s)`
            : `Rejected ${data.processed || ids.length} employer(s)`,
        );
        setRejectRow(null);
        setAuditRow(null);
        setRejectNote('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(checked) {
    setSelected(checked ? filtered.filter((e) => e.approval_status === 'pending').map((e) => e.id) : []);
  }

  function toggleOne(id, checked) {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
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
    patchStatus([rejectRow.id], 'rejected', reason);
  }

  const pendingCount = meta.pending ?? enriched.filter((e) => e.approval_status === 'pending').length;

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
            <h1>Employer Approvals Queue</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{pendingCount} Pending Review</span>
          </div>
          <p>Verify recruiter credentials and organizational legitimacy before unlocking internship posting access.</p>
        </div>
        <button
          type="button"
          className="ip-saq-btn ip-saq-btn--emerald"
          disabled={!selected.length || busy || filter !== 'pending'}
          onClick={() => patchStatus(selected, 'approved')}
        >
          <CheckCheck size={15} aria-hidden />
          Approve Selected ({selected.length})
        </button>
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
            <strong>{pendingCount}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Needs Audit</span>
          </div>
          <p className="ip-saq-metric__sub">Recruiters awaiting access</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Approved This Week</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <ShieldCheck size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.approvedThisWeek ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Active Access</span>
          </div>
          <p className="ip-saq-metric__sub">Verified organizations</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>High Risk / Mismatch</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <AlertTriangle size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{mismatchCount}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Action Required</span>
          </div>
          <p className="ip-saq-metric__sub">Domain mismatch alerts (this view)</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Avg Triage Speed</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <Zap size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{formatHours(meta.avgTriageHours)}</strong>
            <span className="ip-saq-pill ip-saq-pill--blue">SLA On Track</span>
          </div>
          <p className="ip-saq-metric__sub">Response duration (30 days)</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs" role="tablist">
            {[
              { id: 'pending', label: 'Pending', count: meta.pending },
              { id: 'approved', label: 'Approved', count: null },
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
                <span>
                  {t.label}
                  {t.count != null && filter === 'pending' ? ` (${t.count})` : ''}
                  {t.id === 'rejected' && meta.rejected != null ? ` (${meta.rejected})` : ''}
                </span>
              </button>
            ))}
          </div>
          <div className="ip-saq-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search company, email, website..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search employers"
            />
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <ShieldCheck size={28} aria-hidden />
            <h4>No {filter} employers</h4>
            <p>Queue is clear for this filter. New signups will appear here for triage.</p>
          </div>
        ) : (
          <div className="ip-saq-table-wrap">
            <table className="ip-saq-table">
              <thead>
                <tr>
                  <th>
                    {filter === 'pending' ? (
                      <input
                        type="checkbox"
                        aria-label="Select all pending"
                        checked={
                          filtered.some((e) => e.approval_status === 'pending') &&
                          filtered
                            .filter((e) => e.approval_status === 'pending')
                            .every((e) => selected.includes(e.id))
                        }
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    ) : null}
                  </th>
                  <th>Company</th>
                  <th>Work Contact</th>
                  <th>Website</th>
                  <th>Domain / Risk Tag</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.approval_status === 'pending' ? (
                        <input
                          type="checkbox"
                          aria-label={`Select ${e.company_name}`}
                          checked={selected.includes(e.id)}
                          onChange={(ev) => toggleOne(e.id, ev.target.checked)}
                        />
                      ) : null}
                    </td>
                    <td>
                      <div className="ip-saq-co">
                        <div className="ip-saq-avatar">{initial(e.company_name)}</div>
                        <div>
                          <strong>{e.company_name || '—'}</strong>
                          <span>{e.contact_designation || 'Organization'}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong style={{ display: 'block', color: '#0f172a' }}>
                        {e.contact_name || e.account_name || '—'}
                      </strong>
                      <span style={{ color: '#64748b' }}>{e.email || '—'}</span>
                    </td>
                    <td>
                      {e.website ? (
                        <a
                          className="ip-saq-link"
                          href={e.website.startsWith('http') ? e.website : `https://${e.website}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.website.replace(/^https?:\/\//, '')}
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`ip-saq-pill ip-saq-pill--${e.risk.tone}`}>
                        {e.risk.key === 'mismatch' ? '⚠ ' : e.risk.key === 'verified' || e.risk.key === 'edu' ? '✓ ' : ''}
                        {e.risk.label}
                      </span>
                    </td>
                    <td>
                      <div className="ip-saq-actions">
                        <button
                          type="button"
                          className="ip-saq-btn ip-saq-btn--sm"
                          onClick={() => setAuditRow(e)}
                        >
                          <FileSearch size={14} aria-hidden />
                          Audit &amp; Docs
                        </button>
                        {e.approval_status === 'pending' ? (
                          <>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                              disabled={busy}
                              onClick={() => patchStatus([e.id], 'approved')}
                            >
                              <Check size={14} aria-hidden />
                              Approve
                            </button>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                              disabled={busy}
                              aria-label="Reject"
                              onClick={() => {
                                setRejectRow(e);
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {auditRow ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-audit-title">
          <div className="ip-saq-modal ip-saq-modal--wide">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <FileSearch size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-audit-title">Review &amp; Audit Docs</h3>
                  <span>{auditRow.company_name}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setAuditRow(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>Contact</span>
                <strong>
                  {auditRow.contact_name || auditRow.account_name} · {auditRow.email}
                </strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Website</span>
                <strong>{auditRow.website || '—'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Risk</span>
                <strong>
                  <span className={`ip-saq-pill ip-saq-pill--${auditRow.risk.tone}`}>{auditRow.risk.label}</span>
                </strong>
              </div>
              <div>
                <span className="ip-saq-label">Uploaded documents</span>
                {(auditRow.documents || []).length ? (
                  (auditRow.documents || []).map((d) => (
                    <div key={d.id} className="ip-saq-doc" style={{ marginBottom: '0.5rem' }}>
                      <div>
                        <strong>{d.doc_type || 'Document'}</strong>
                        <div style={{ color: '#64748b' }}>{d.file_name || d.url}</div>
                      </div>
                      {d.url ? (
                        <a className="ip-saq-link" href={d.url} target="_blank" rel="noreferrer">
                          Open PDF
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>No URL</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>No documents uploaded yet.</p>
                )}
              </div>
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setAuditRow(null)}>
                Close
              </button>
              {auditRow.approval_status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    disabled={busy}
                    onClick={() => {
                      setRejectRow(auditRow);
                      setAuditRow(null);
                    }}
                  >
                    Reject…
                  </button>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--emerald"
                    disabled={busy}
                    onClick={() => patchStatus([auditRow.id], 'approved')}
                  >
                    Approve employer
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {rejectRow ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-reject-title">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico ip-saq-modal__ico--rose">
                  <X size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-reject-title">Rejection reason</h3>
                  <span>Sent to {rejectRow.email || 'recruiter'}</span>
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
                <label className="ip-saq-label" htmlFor="ip-saq-reject-note">
                  Audit note
                </label>
                <textarea
                  id="ip-saq-reject-note"
                  className="ip-saq-textarea"
                  placeholder="Optional detail for the recruiter…"
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
