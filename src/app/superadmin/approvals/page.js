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
  PauseCircle,
  Search,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import '@/components/ip/ip-list-pager.css';
import IpListPager from '@/components/ip/IpListPager';
import { IpListEmpty, IpListLoading } from '@/components/ip/IpListStatus';
import { useClientPagination } from '@/hooks/useClientPagination';
import { SA_PAGE_SIZE } from '@/lib/ipSuperadminList';
import { employerDomainRisk, REJECT_PRESETS } from '@/lib/ipDomainRisk';
import { registrationPathLabel } from '@/lib/ipRegistrationPathLabel';

function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?';
}

function formatHours(h) {
  if (h == null || Number.isNaN(Number(h))) return '—';
  return `${Number(h).toFixed(1)}h`;
}

export default function SuperAdminApprovalsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [filter, setFilter] = useState('pending');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({
    pending: 0,
    approvedThisWeek: 0,
    rejected: 0,
    suspended: 0,
    avgTriageHours: null,
  });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [auditRow, setAuditRow] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [rejectPreset, setRejectPreset] = useState(REJECT_PRESETS[0]);
  const [rejectNote, setRejectNote] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/employers?status=${filter}&meta=1`, {
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed To Load (${res.status})`);
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      if (data.meta) setMeta(data.meta);
      setSelected([]);
    } catch (e) {
      setError(e.message || 'Failed To Load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (session?.user?.role === 'superadmin') {
      load();
      return;
    }
    setLoading(false);
    if (sessionStatus === 'authenticated') {
      setError(
        `Forbidden — Approvals requires SuperAdmin. Your session role is “${session?.user?.role || 'unknown'}”. Sign out, then sign in at /superadmin/login as support@placementhub.online.`,
      );
      setItems([]);
    }
  }, [session, sessionStatus, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const enriched = useMemo(
    () =>
      items.map((e) => {
        const email = e.work_email || e.account_email || '';
        const risk = employerDomainRisk({
          email,
          website: e.website,
          emailSoftFail: e.email_soft_fail,
          emailClassificationSummary: e.email_classification_summary,
        });
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
      [e.company_name, e.email, e.website, e.contact_name, e.account_name, e.registration_source, registrationPathLabel(e.registration_source)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [enriched, search]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(
    filtered,
    SA_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [filter, search, setPage]);

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
        const n = data.processed || ids.length;
        const toastByStatus = {
          approved: `Approved ${n} employer(s)`,
          rejected: `Rejected ${n} employer(s)`,
          suspended: `Suspended ${n} employer(s)`,
          pending: `Set ${n} employer(s) to Pending`,
        };
        setToast(toastByStatus[approvalStatus] || `Updated ${n} employer(s)`);
        setRejectRow(null);
        setAuditRow(null);
        setRejectNote('');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelected(ids) {
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} employer account(s)? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/employers/${ids[0]}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Delete failed');
      else {
        setToast(`Deleted ${data.processed || ids.length} employer(s)`);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resetEthicsSelected(ids) {
    if (!ids.length) return;
    if (
      !window.confirm(
        `Reset Guidelines & Ethics for ${ids.length} employer(s)? They must Accept & Save again before posting.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/employers/${ids[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'resetEthics' }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Ethics reset failed');
      else {
        setToast(`Reset ethics for ${data.processed || ids.length} employer(s)`);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleAll(checked) {
    const selectable = filtered.filter((e) =>
      ['pending', 'approved', 'suspended'].includes(String(e.approval_status || '')),
    );
    setSelected(checked ? selectable.map((e) => e.id) : []);
  }

  function toggleOne(id, checked) {
    setSelected((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  }

  function openReject(row) {
    setRejectRow(row);
    setRejectPreset(REJECT_PRESETS[0]);
    setRejectNote('');
  }

  function confirmSuspend(ids) {
    if (!ids.length) return;
    if (
      !window.confirm(
        `Suspend ${ids.length} employer account(s)? They will not be able to sign in or post until restored.`,
      )
    ) {
      return;
    }
    patchStatus(ids, 'suspended');
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
  const selectableOnPage = pageItems.filter((e) =>
    ['pending', 'approved', 'suspended'].includes(String(e.approval_status || '')),
  );

  return (
    <div className="ip-sa-q ip-mobile-bleed">
      {toast ? (
        <div className="ip-saq-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Final Employer Approvals</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{pendingCount} Pending Review</span>
          </div>
          <p>
            Employers can sign in after email verify to upload documents. Final approval here unlocks
            posting. Approve verification documents in Documents first — then complete final employer
            approval here.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {filter === 'pending' ? (
            <>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--emerald"
                disabled={!selected.length || busy}
                onClick={() => patchStatus(selected, 'approved')}
              >
                <CheckCheck size={15} aria-hidden />
                Approve Selected ({selected.length})
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={!selected.length || busy}
                onClick={() => patchStatus(selected, 'rejected', 'Bulk rejected by SuperAdmin')}
              >
                <X size={15} aria-hidden />
                Reject Selected ({selected.length})
              </button>
            </>
          ) : null}
          {filter === 'approved' ? (
            <>
              <button
                type="button"
                className="ip-saq-btn"
                disabled={!selected.length || busy}
                onClick={() => confirmSuspend(selected)}
              >
                <PauseCircle size={15} aria-hidden />
                Suspend Selected ({selected.length})
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={!selected.length || busy}
                onClick={() => patchStatus(selected, 'rejected', 'Bulk rejected by SuperAdmin')}
              >
                <X size={15} aria-hidden />
                Reject Selected ({selected.length})
              </button>
            </>
          ) : null}
          {filter === 'suspended' ? (
            <>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--emerald"
                disabled={!selected.length || busy}
                onClick={() => patchStatus(selected, 'approved')}
              >
                <CheckCheck size={15} aria-hidden />
                Restore Selected ({selected.length})
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={!selected.length || busy}
                onClick={() => patchStatus(selected, 'rejected', 'Bulk rejected by SuperAdmin')}
              >
                <X size={15} aria-hidden />
                Reject Selected ({selected.length})
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="ip-saq-btn"
            disabled={!selected.length || busy}
            onClick={() => deleteSelected(selected)}
          >
            Delete Selected ({selected.length})
          </button>
          <button
            type="button"
            className="ip-saq-btn"
            disabled={!selected.length || busy}
            onClick={() => resetEthicsSelected(selected)}
            title="Unlock Guidelines & Ethics so the employer can Accept & Save again"
          >
            Reset Ethics ({selected.length})
          </button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>
            {/forbidden|unauthorized|role|sign in|sign out/i.test(error)
              ? 'Could not load Approvals'
              : /has not uploaded any verification documents/i.test(error)
                ? 'Employer must upload documents first'
                : /Documents tab/i.test(error)
                  ? 'Approve documents in Documents first'
                  : 'Cannot complete this approval'}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

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
              { id: 'suspended', label: 'Suspended', count: meta.suspended },
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
                {t.id === 'suspended' ? <PauseCircle size={14} aria-hidden /> : null}
                {t.id === 'rejected' ? <X size={14} aria-hidden /> : null}
                <span>
                  {t.label}
                  {t.count != null ? ` (${t.count})` : ''}
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

        {loading || sessionStatus === 'loading' ? (
          <IpListLoading label="Loading Employer Approvals…" />
        ) : !filtered.length ? (
          <IpListEmpty
            icon={ShieldCheck}
            title={search.trim() ? 'No Matching Employers' : `No ${filter} Employers`}
            hint={
              search.trim()
                ? 'Try A Different Search.'
                : 'Queue Is Clear For This Filter. New Signups Will Appear Here For Triage.'
            }
          />
        ) : (
          <>
          <div className="ip-saq-table-wrap">
            <table className="ip-ph-list ip-saq-table">
              <thead>
                <tr>
                  <th>
                    {filter === 'pending' || filter === 'approved' || filter === 'suspended' ? (
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={
                          selectableOnPage.length > 0 &&
                          selectableOnPage.every((e) => selected.includes(e.id))
                        }
                        onChange={(e) => toggleAll(e.target.checked)}
                      />
                    ) : null}
                  </th>
                  <th>Company</th>
                  <th>Path</th>
                  <th>Work Contact</th>
                  <th>Website</th>
                  <th>Domain / Risk Tag</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {['pending', 'approved', 'suspended'].includes(String(e.approval_status || '')) ? (
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
                      <span className="ip-saq-pill ip-saq-pill--brand">
                        {registrationPathLabel(e.registration_source)}
                      </span>
                      {e.approval_status === 'pending' ? (
                        <div style={{ marginTop: '0.35rem' }}>
                          <span
                            className={`ip-saq-pill ${
                              e.docs_ready_for_final_approval
                                ? 'ip-saq-pill--ok'
                                : 'ip-saq-pill--warn'
                            }`}
                          >
                            {e.docs_ready_for_final_approval
                              ? 'Documents Ready'
                              : 'Documents Required First'}
                          </span>
                        </div>
                      ) : null}
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
                              onClick={() => openReject(e)}
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : null}
                        {e.approval_status === 'approved' ? (
                          <>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--sm"
                              disabled={busy}
                              onClick={() => confirmSuspend([e.id])}
                            >
                              <PauseCircle size={14} aria-hidden />
                              Suspend
                            </button>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                              disabled={busy}
                              aria-label="Reject"
                              onClick={() => openReject(e)}
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : null}
                        {e.approval_status === 'suspended' ? (
                          <>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                              disabled={busy}
                              onClick={() => patchStatus([e.id], 'approved')}
                            >
                              <Check size={14} aria-hidden />
                              Restore
                            </button>
                            <button
                              type="button"
                              className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                              disabled={busy}
                              aria-label="Reject"
                              onClick={() => openReject(e)}
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
          <div className="ip-saq-pager">
            <IpListPager
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              buttonClassName="ip-saq-btn ip-saq-btn--sm"
            />
          </div>
          </>
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
                      openReject(auditRow);
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
              {auditRow.approval_status === 'approved' ? (
                <>
                  <button
                    type="button"
                    className="ip-saq-btn"
                    disabled={busy}
                    onClick={() => confirmSuspend([auditRow.id])}
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    disabled={busy}
                    onClick={() => {
                      openReject(auditRow);
                      setAuditRow(null);
                    }}
                  >
                    Reject…
                  </button>
                </>
              ) : null}
              {auditRow.approval_status === 'suspended' ? (
                <>
                  <button
                    type="button"
                    className="ip-saq-btn ip-saq-btn--rose"
                    disabled={busy}
                    onClick={() => {
                      openReject(auditRow);
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
                    Restore employer
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
