'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Building2,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import { candidateDomainBadge, employerDomainRisk } from '@/lib/ipDomainRisk';

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

export default function FormRegistrationsPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState('candidates'); // candidates | employers | approved
  const [candidates, setCandidates] = useState([]);
  const [approved, setApproved] = useState([]);
  const [employers, setEmployers] = useState([]);
  const [meta, setMeta] = useState({
    pendingCandidates: 0,
    pendingEmployers: 0,
    autoApprovedGoogle: 0,
    totalActiveUsers: 0,
    approvedToday: 0,
  });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [detail, setDetail] = useState(null);

  async function load() {
    const [cRes, aRes, eRes] = await Promise.all([
      fetch('/api/ip/superadmin/form-registrations?status=pending&meta=1'),
      fetch('/api/ip/superadmin/form-registrations?status=approved'),
      fetch('/api/ip/superadmin/requests?status=pending'),
    ]);
    const cData = await cRes.json();
    const aData = await aRes.json();
    const eData = await eRes.json();
    if (cRes.ok) {
      setCandidates(cData.items || []);
      if (cData.meta) setMeta(cData.meta);
    } else setError(cData.error || 'Failed to load candidates');
    if (aRes.ok) setApproved(aData.items || []);
    if (eRes.ok) setEmployers(eData.items || []);
    setSelected([]);
  }

  useEffect(() => {
    if (session?.user?.role === 'superadmin') load();
  }, [session]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const pendingTotal = (meta.pendingCandidates || 0) + (meta.pendingEmployers || employers.length || 0);

  const candidateRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = candidates.map((c) => ({
      ...c,
      badge: candidateDomainBadge(c.email),
    }));
    if (!q) return rows;
    return rows.filter((c) =>
      [c.name, c.email, c.college, c.degree].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [candidates, search]);

  const employerRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = employers.map((e) => ({
      ...e,
      risk: employerDomainRisk({ email: e.contact_email, website: e.website }),
    }));
    if (!q) return rows;
    return rows.filter((e) =>
      [e.company_name, e.contact_email, e.contact_name, e.website, e.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [employers, search]);

  const approvedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return approved;
    return approved.filter((c) =>
      [c.name, c.email, c.college].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [approved, search]);

  async function processCandidates(ids, status) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/form-registrations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed');
      else {
        setToast(data.message || `Updated ${ids.length}`);
        setDetail(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function processEmployer(id, status) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'Failed');
      else {
        setToast(data.message || `Employer ${status}`);
        setDetail(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
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
            <h1>Form Registrations</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{pendingTotal} Pending Review</span>
          </div>
          <p>Review and allow or reject user accounts that signed up via the manual email/password registration form.</p>
        </div>
        {tab === 'candidates' ? (
          <button
            type="button"
            className="ip-saq-btn ip-saq-btn--emerald"
            disabled={!selected.length || busy}
            onClick={() => processCandidates(selected, 'approved')}
          >
            <CheckCheck size={15} aria-hidden />
            Bulk Approve ({selected.length})
          </button>
        ) : null}
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Triage</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{pendingTotal}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Needs Review</span>
          </div>
          <p className="ip-saq-metric__sub">
            {meta.pendingCandidates || 0} candidates · {meta.pendingEmployers || employers.length} employers
          </p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Auto-Approved</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <UserCheck size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.autoApprovedGoogle ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Google</span>
          </div>
          <p className="ip-saq-metric__sub">Google signups already active</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Approved Today</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <Check size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.approvedToday ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--brand">Form</span>
          </div>
          <p className="ip-saq-metric__sub">Form registrations cleared today</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total Active</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <Users size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.totalActiveUsers ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--blue">Platform</span>
          </div>
          <p className="ip-saq-metric__sub">Active user accounts</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs" role="tablist">
            {[
              { id: 'candidates', label: 'Candidates', icon: Users },
              { id: 'employers', label: 'Employers', icon: Building2 },
              { id: 'approved', label: 'Approved Log', icon: FileText },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`ip-saq-tab${tab === t.id ? ' ip-saq-tab--on' : ''}`}
                  onClick={() => {
                    setTab(t.id);
                    setSelected([]);
                  }}
                >
                  <Icon size={14} aria-hidden />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <div className="ip-saq-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search queue by name, email, institution..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search registrations"
            />
          </div>
        </div>

        {tab === 'candidates' ? (
          !candidateRows.length ? (
            <div className="ip-saq-empty">
              <ShieldCheck size={28} aria-hidden />
              <h4>No Pending Candidate Form Registrations</h4>
              <p>New email/password candidate signups will appear here for approval.</p>
            </div>
          ) : (
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={candidateRows.length > 0 && candidateRows.every((c) => selected.includes(c.id))}
                        onChange={(e) =>
                          setSelected(e.target.checked ? candidateRows.map((c) => c.id) : [])
                        }
                      />
                    </th>
                    <th>Candidate</th>
                    <th>Institution</th>
                    <th>Domain</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateRows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selected.includes(c.id)}
                          onChange={(e) =>
                            setSelected((prev) =>
                              e.target.checked ? [...new Set([...prev, c.id])] : prev.filter((x) => x !== c.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <div className="ip-saq-co">
                          <div className="ip-saq-avatar">{initial(c.name)}</div>
                          <div>
                            <strong>{c.name || '—'}</strong>
                            <span>{c.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong style={{ display: 'block' }}>{c.college || '—'}</strong>
                        <span style={{ color: '#64748b' }}>
                          {c.degree || '—'}
                          {c.graduation_year ? ` · ${c.graduation_year}` : ''}
                          {c.cgpa ? ` · CGPA ${c.cgpa}` : ''}
                        </span>
                      </td>
                      <td>
                        <span className={`ip-saq-pill ip-saq-pill--${c.badge.tone}`}>{c.badge.label}</span>
                      </td>
                      <td>{fmtDate(c.created_at)}</td>
                      <td>
                        <div className="ip-saq-actions">
                          <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setDetail({ type: 'candidate', row: c })}>
                            Review
                          </button>
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--sm ip-saq-btn--emerald"
                            disabled={busy}
                            onClick={() => processCandidates([c.id], 'approved')}
                          >
                            <Check size={14} aria-hidden />
                            Approve
                          </button>
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                            disabled={busy}
                            aria-label="Reject"
                            onClick={() => processCandidates([c.id], 'rejected')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'employers' ? (
          !employerRows.length ? (
            <div className="ip-saq-empty">
              <Building2 size={28} aria-hidden />
              <h4>No Pending Employer Form Registrations</h4>
              <p>Domain-mismatch employer form requests also appear under Manual requests.</p>
            </div>
          ) : (
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th>Risk</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employerRows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="ip-saq-co">
                          <div className="ip-saq-avatar">{initial(e.company_name)}</div>
                          <div>
                            <strong>{e.company_name || '—'}</strong>
                            <span>{e.website || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong style={{ display: 'block' }}>{e.contact_name || '—'}</strong>
                        <span style={{ color: '#64748b' }}>{e.contact_email}</span>
                      </td>
                      <td>
                        <span className={`ip-saq-pill ip-saq-pill--${e.risk.tone}`}>{e.risk.label}</span>
                      </td>
                      <td>{fmtDate(e.created_at)}</td>
                      <td>
                        <div className="ip-saq-actions">
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--sm"
                            onClick={() => setDetail({ type: 'employer', row: e })}
                          >
                            Review Docs &amp; Approve
                          </button>
                          <button
                            type="button"
                            className="ip-saq-btn ip-saq-btn--icon ip-saq-btn--rose"
                            disabled={busy}
                            aria-label="Reject"
                            onClick={() => processEmployer(e.id, 'rejected')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {tab === 'approved' ? (
          !approvedRows.length ? (
            <div className="ip-saq-empty">
              <FileText size={28} aria-hidden />
              <h4>No approved form registrations yet</h4>
              <p>Approved candidate form accounts will list here.</p>
            </div>
          ) : (
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Institution</th>
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedRows.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="ip-saq-co">
                          <div className="ip-saq-avatar">{initial(c.name)}</div>
                          <div>
                            <strong>{c.name}</strong>
                            <span>{c.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>{c.college || '—'}</td>
                      <td>
                        <span className="ip-saq-pill ip-saq-pill--ok">Approved</span>
                      </td>
                      <td>{fmtDate(c.updated_at || c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      {detail ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-fr-title">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <FileText size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-fr-title">
                    {detail.type === 'candidate' ? 'Review Registration Credentials' : 'Review Employer Request'}
                  </h3>
                  <span>Form registration queue</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              {detail.type === 'candidate' ? (
                <>
                  <div className="ip-saq-modal-row">
                    <span>Name</span>
                    <strong>{detail.row.name}</strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>Email</span>
                    <strong>{detail.row.email}</strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>College</span>
                    <strong>{detail.row.college || '—'}</strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>Degree / Year</span>
                    <strong>
                      {detail.row.degree || '—'}
                      {detail.row.graduation_year ? ` · ${detail.row.graduation_year}` : ''}
                    </strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>CGPA</span>
                    <strong>{detail.row.cgpa || '—'}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="ip-saq-modal-row">
                    <span>Company</span>
                    <strong>{detail.row.company_name}</strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>Contact</span>
                    <strong>
                      {detail.row.contact_name} · {detail.row.contact_email}
                    </strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>Website</span>
                    <strong>{detail.row.website || '—'}</strong>
                  </div>
                  <div className="ip-saq-modal-row">
                    <span>Reason</span>
                    <strong>{detail.row.reason || '—'}</strong>
                  </div>
                </>
              )}
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setDetail(null)}>
                Close
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--rose"
                disabled={busy}
                onClick={() =>
                  detail.type === 'candidate'
                    ? processCandidates([detail.row.id], 'rejected')
                    : processEmployer(detail.row.id, 'rejected')
                }
              >
                Reject Account
              </button>
              <button
                type="button"
                className="ip-saq-btn ip-saq-btn--emerald"
                disabled={busy}
                onClick={() =>
                  detail.type === 'candidate'
                    ? processCandidates([detail.row.id], 'approved')
                    : processEmployer(detail.row.id, 'approved')
                }
              >
                {detail.type === 'candidate' ? 'Approve Account' : 'Create Employer Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
