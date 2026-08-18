'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  FileSearch,
  FolderArchive,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { employerDomainRisk, REJECT_PRESETS } from '@/lib/ipDomainRisk';

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

const DOC_TYPES = ['all', 'Shop Act', 'Business PAN', 'GST', 'Other'];

export default function SuperAdminDocumentsPage() {
  const [tab, setTab] = useState('all');
  const [docType, setDocType] = useState('all');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [audit, setAudit] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [rejectPreset, setRejectPreset] = useState(REJECT_PRESETS[0]);
  const [rejectNote, setRejectNote] = useState('');

  async function load() {
    const statusQ = tab === 'all' ? '' : `status=${tab === 'rejected' ? 'flagged' : tab}&`;
    const res = await fetch(`/api/ip/superadmin/documents?${statusQ}meta=1`);
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

  const enriched = useMemo(
    () =>
      items.map((d) => ({
        ...d,
        risk: employerDomainRisk({ email: d.work_email, website: d.website }),
        status: d.display_status || (d.review_status === 'flagged' ? 'rejected' : d.review_status || 'pending'),
      })),
    [items],
  );

  const mismatchCount = useMemo(() => enriched.filter((d) => d.risk.key === 'mismatch').length, [enriched]);

  const filtered = useMemo(() => {
    let rows = enriched;
    if (docType !== 'all') {
      rows = rows.filter((d) => String(d.doc_type || '').toLowerCase() === docType.toLowerCase());
    }
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      [d.company_name, d.work_email, d.file_name, d.doc_type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [enriched, search, docType]);

  async function review(ids, reviewStatus, notes) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, reviewStatus, notes }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Update failed');
      else {
        setToast(
          reviewStatus === 'approved'
            ? `Approved ${data.processed || ids.length} document(s)`
            : `Rejected ${data.processed || ids.length} document(s)`,
        );
        setAudit(null);
        setRejectRow(null);
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
    review([rejectRow.id], 'flagged', reason || 'Rejected');
  }

  const pendingSelectable = filtered.filter((d) => d.status === 'pending');

  return (
    <div className="ip-sa-q">
      {toast ? <div className="ip-saq-toast" role="status">{toast}</div> : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Verification Documents Audit</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{meta.pending || 0} Pending Review</span>
          </div>
          <p>Review Shop Act, Business PAN, GST registration, and company identity evidence submitted by recruiters.</p>
        </div>
        <button
          type="button"
          className="ip-saq-btn ip-saq-btn--emerald"
          disabled={!selected.length || busy}
          onClick={() => review(selected, 'approved')}
        >
          <CheckCheck size={15} aria-hidden />
          Approve Selected ({selected.length})
        </button>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total Documents</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <FolderArchive size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.total ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--brand">All Uploads</span>
          </div>
          <p className="ip-saq-metric__sub">Shop Act, PAN &amp; Certificates</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Audit</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.pending ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Action Required</span>
          </div>
          <p className="ip-saq-metric__sub">Awaiting SuperAdmin review</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Verified Documents</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <ShieldCheck size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.approved ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Approved</span>
          </div>
          <p className="ip-saq-metric__sub">Legal compliance clear</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Domain Mismatches</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <AlertTriangle size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{mismatchCount}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">High Risk</span>
          </div>
          <p className="ip-saq-metric__sub">Mismatched domain alerts (this view)</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs" role="tablist">
            {[
              { id: 'all', label: `All (${meta.total ?? 0})` },
              { id: 'pending', label: `Pending (${meta.pending ?? 0})` },
              { id: 'approved', label: `Approved (${meta.approved ?? 0})` },
              { id: 'rejected', label: `Rejected (${meta.rejected ?? 0})` },
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="ip-saq-select" value={docType} onChange={(e) => setDocType(e.target.value)} aria-label="Document type">
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All Document Types' : t}
                </option>
              ))}
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search company, file, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <FolderArchive size={28} aria-hidden />
            <h4>No documents in this view</h4>
            <p>Employer uploads will appear here for compliance review.</p>
          </div>
        ) : (
          <div className="ip-saq-table-wrap">
            <table className="ip-saq-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all pending"
                      checked={pendingSelectable.length > 0 && pendingSelectable.every((d) => selected.includes(d.id))}
                      onChange={(e) =>
                        setSelected(e.target.checked ? pendingSelectable.map((d) => d.id) : [])
                      }
                    />
                  </th>
                  <th>Company &amp; Recruiter</th>
                  <th>Document Type</th>
                  <th>Uploaded File</th>
                  <th>Domain Risk</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {d.status === 'pending' ? (
                        <input
                          type="checkbox"
                          checked={selected.includes(d.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...new Set([...prev, d.id])] : prev.filter((x) => x !== d.id),
                            )
                          }
                        />
                      ) : null}
                    </td>
                    <td>
                      <div className="ip-saq-co">
                        <div className="ip-saq-avatar">{initial(d.company_name)}</div>
                        <div>
                          <strong>{d.company_name}</strong>
                          <span>{d.work_email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ip-saq-pill ip-saq-pill--slate">{d.doc_type || 'Other'}</span>
                    </td>
                    <td>
                      {d.url ? (
                        <a className="ip-saq-link" href={d.url} target="_blank" rel="noreferrer">
                          {d.file_name || 'Open file'}
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      ) : (
                        d.file_name || '—'
                      )}
                      <div style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                        {[d.file_size_label, fmtDate(d.created_at)].filter(Boolean).join(' • ')}
                      </div>
                    </td>
                    <td>
                      <span className={`ip-saq-pill ip-saq-pill--${d.risk.tone}`}>
                        {d.risk.key === 'mismatch' ? '⚠ ' : '✓ '}
                        {d.risk.label === 'Verified Corporate' || d.risk.label === 'Edu Account'
                          ? 'Verified'
                          : d.risk.label}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`ip-saq-pill ${
                          d.status === 'approved'
                            ? 'ip-saq-pill--ok'
                            : d.status === 'rejected'
                              ? 'ip-saq-pill--danger'
                              : 'ip-saq-pill--warn'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td>
                      <div className="ip-saq-actions">
                        <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setAudit(d)}>
                          <FileSearch size={14} aria-hidden />
                          Audit PDF
                        </button>
                        {d.status === 'pending' ? (
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                            disabled={busy}
                            onClick={() => review([d.id], 'approved')}
                          >
                            <Check size={14} aria-hidden />
                            Approve
                          </button>
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

      {audit ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal ip-saq-modal--wide">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <FileSearch size={18} aria-hidden />
                </div>
                <div>
                  <h3>{audit.file_name || 'Document'}</h3>
                  <span>
                    {audit.doc_type} • {audit.company_name}
                  </span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setAudit(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              {audit.risk.key === 'mismatch' ? (
                <div className="ip-saq-error" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  Security Alert: Domain Mismatch — {audit.work_email}
                </div>
              ) : null}
              {audit.url ? (
                <iframe title="Document preview" src={audit.url} style={{ width: '100%', height: '22rem', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
              ) : (
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>No file URL available.</p>
              )}
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setAudit(null)}>
                Close
              </button>
              {audit.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    onClick={() => {
                      setRejectRow(audit);
                      setAudit(null);
                    }}
                  >
                    Reject Document
                  </button>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--emerald"
                    disabled={busy}
                    onClick={() => review([audit.id], 'approved')}
                  >
                    Approve Document
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
                  <h3>Rejection reason</h3>
                  <span>{rejectRow.file_name}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setRejectRow(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
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
              <textarea
                className="ip-saq-textarea"
                placeholder="Audit note for the recruiter…"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
              />
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
