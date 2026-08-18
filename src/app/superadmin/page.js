'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-dashboard-gemini.css';

function domainFromEmployer(e) {
  return e.domain || '—';
}

function buildQueues(stats) {
  const pendingEmp = Number(stats?.pendingEmployers || 0);
  const pendingReq = Number(stats?.pendingRequests || 0);
  const pendingIdeas = Number(stats?.pendingIdeas || 0);
  const pendingDocs = Number(stats?.pendingDocuments || 0);
  const pendingViral = Number(stats?.pendingViral || 0);
  const pendingPromos = Number(stats?.pendingPromotions || 0);
  const unread = Number(stats?.unreadMessages || 0);
  const live = Number(stats?.internships?.live || 0);
  const offersAccepted = Number(stats?.offers?.accepted || 0);
  const offersTotal = Number(stats?.offers?.total || 0);
  const formRegs = Number(stats?.pendingFormRegistrations || 0);

  return [
    {
      id: 'emp-app',
      area: 'Employer Approvals',
      desc: 'Review and approve/reject employer registration accounts.',
      href: '/superadmin/approvals',
      badge: pendingEmp > 0 ? 'Needs Triage' : 'Clear',
      badgeClass: pendingEmp > 0 ? 'ip-sad-pill--warn' : 'ip-sad-pill--ok',
      action: pendingEmp > 0 ? 'Review Pending' : 'Queue Clear',
      openModal: pendingEmp > 0,
    },
    {
      id: 'form-reg',
      area: 'Form Registrations',
      desc: 'Approve or reject candidate accounts that signed up via public form.',
      href: '/superadmin/form-registrations',
      badge: formRegs > 0 ? `${formRegs} Pending` : 'Clear',
      badgeClass: formRegs > 0 ? 'ip-sad-pill--warn' : 'ip-sad-pill--slate',
      action: formRegs > 0 ? 'Review Forms' : 'View History',
    },
    {
      id: 'man-req',
      area: 'Manual Requests',
      desc: 'Create employer accounts from domain-mismatch requests.',
      href: '/superadmin/requests',
      badge: pendingReq > 0 ? `${pendingReq} Pending` : 'Clear',
      badgeClass: pendingReq > 0 ? 'ip-sad-pill--warn' : 'ip-sad-pill--slate',
      action: pendingReq > 0 ? 'Review Requests' : 'View History',
    },
    {
      id: 'feat-id',
      area: 'Feature Ideas',
      desc: 'Triage Suggestions & Ideas submissions from candidate/employer boards.',
      href: '/superadmin/feature-ideas',
      badge: pendingIdeas > 0 ? 'New Feedback' : 'Clear',
      badgeClass: pendingIdeas > 0 ? 'ip-sad-pill--brand' : 'ip-sad-pill--slate',
      action: 'Moderate Ideas',
    },
    {
      id: 'log-rep',
      area: 'Login Report',
      desc: 'Authentication activity and security audit logs across all roles.',
      href: '/superadmin/login-report',
      badge: 'Logged',
      badgeClass: 'ip-sad-pill--slate',
      action: 'Audit Logs',
    },
    {
      id: 'msg-thr',
      area: 'Messages & Support',
      desc: 'Operational alerts and support notifications routed to SuperAdmin.',
      href: '/superadmin/messages',
      badge: unread > 0 ? 'Open Ticket' : 'Clear',
      badgeClass: unread > 0 ? 'ip-sad-pill--blue' : 'ip-sad-pill--slate',
      action: 'Open Inbox',
    },
    {
      id: 'ver-doc',
      area: 'Verification Documents',
      desc: 'Review uploaded employer credentials (Shop Act / LLP / PAN).',
      href: '/superadmin/documents',
      badge: pendingDocs > 0 ? 'Pending Verification' : 'Clear',
      badgeClass: pendingDocs > 0 ? 'ip-sad-pill--warn' : 'ip-sad-pill--slate',
      action: 'Verify Docs',
    },
    {
      id: 'post-mod',
      area: 'Posting Moderation',
      desc: 'Pause, flag, or remove flagged internship listings.',
      href: '/superadmin/postings',
      badge: `${live} Active`,
      badgeClass: 'ip-sad-pill--ok',
      action: 'Manage Listings',
    },
    {
      id: 'lin-pro',
      area: 'LinkedIn Promotions',
      desc: 'Verify promotion tokens / fast-track URLs submitted by recruiters.',
      href: '/superadmin/promotions',
      badge: pendingPromos > 0 ? `${pendingPromos} Pending` : 'Clear',
      badgeClass: pendingPromos > 0 ? 'ip-sad-pill--warn' : 'ip-sad-pill--slate',
      action: 'View Tokens',
    },
    {
      id: 'vir-sha',
      area: 'Viral Shares Queue',
      desc: 'LinkedIn site shares queued for 24h Google search verification.',
      href: '/superadmin/viral',
      badge: pendingViral > 0 ? 'Queue Active' : 'Clear',
      badgeClass: pendingViral > 0 ? 'ip-sad-pill--purple' : 'ip-sad-pill--slate',
      action: 'Run Verification',
    },
    {
      id: 'off-hir',
      area: 'Offers & Hiring Audits',
      desc: 'Review official offer approvals and candidate sign-off compliance.',
      href: '/superadmin/approvals',
      badge: `${offersAccepted}/${offersTotal} Accepted`,
      badgeClass: 'ip-sad-pill--slate',
      action: 'Review Pipeline',
    },
  ];
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/ip/superadmin/stats');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load stats');
      setStats(data);
      setError('');
    } catch (e) {
      setError(e.message);
      setStats(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const queues = useMemo(() => buildQueues(stats), [stats]);
  const filteredQueues = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return queues;
    return queues.filter(
      (q) => q.area.toLowerCase().includes(needle) || q.desc.toLowerCase().includes(needle),
    );
  }, [queues, searchTerm]);

  const pendingList = stats?.pendingEmployersList || [];
  const firstPending = pendingList[0] || null;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  async function exportAudit() {
    setExporting(true);
    try {
      const res = await fetch('/api/ip/superadmin/export-audit');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `superadmin-system-audit-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('System audit log downloaded.');
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function setEmployerStatus(id, approvalStatus) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/employers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setSelectedApproval(null);
      showToast(
        approvalStatus === 'approved'
          ? 'Employer account approved successfully!'
          : 'Employer account request rejected.',
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!stats && !error) {
    return <div className="ip-sad-loading">Loading SuperAdmin dashboard…</div>;
  }

  const candidates = stats?.candidates ?? '—';
  const employers = stats?.employers ?? '—';
  const pendingEmp = Number(stats?.pendingEmployers || 0);
  const internshipsTotal = stats?.internships?.total ?? '—';
  const internshipsLive = Number(stats?.internships?.live || 0);
  const applications = stats?.applications ?? '—';
  const offersAccepted = Number(stats?.offers?.accepted || 0);
  const offersTotal = Number(stats?.offers?.total || 0);

  return (
    <div className="ip-sa-dash">
      {toast ? (
        <div className="ip-sad-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-sad-head">
        <div>
          <h1>SuperAdmin Dashboard</h1>
          <p>Platform trust, employer approvals, posting moderation, and operational reporting triage.</p>
        </div>
        <button type="button" className="ip-sad-btn" onClick={exportAudit} disabled={exporting}>
          <Download size={14} aria-hidden />
          {exporting ? 'Exporting…' : 'Export System Audit Log'}
        </button>
      </div>

      {error ? <div className="ip-sad-error">{error}</div> : null}

      <div className="ip-sad-metrics">
        <div className="ip-sad-metric">
          <div className="ip-sad-metric__top">
            <span>Candidates</span>
            <div className="ip-sad-metric__ico ip-sad-metric__ico--blue">
              <Users size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-sad-metric__row">
            <strong>{candidates}</strong>
            <span className="ip-sad-pill ip-sad-pill--ok">Registered</span>
          </div>
          <p className="ip-sad-metric__sub">Verified student profiles</p>
        </div>

        <div className="ip-sad-metric">
          <div className="ip-sad-metric__top">
            <span>Employers</span>
            <div className="ip-sad-metric__ico ip-sad-metric__ico--amber">
              <Building2 size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-sad-metric__row">
            <strong>{employers}</strong>
            {pendingEmp > 0 ? (
              <span className="ip-sad-pill ip-sad-pill--warn">{pendingEmp} Pending</span>
            ) : (
              <span className="ip-sad-pill ip-sad-pill--ok">All Approved</span>
            )}
          </div>
          <p className="ip-sad-metric__sub">Registered organization accounts</p>
        </div>

        <div className="ip-sad-metric">
          <div className="ip-sad-metric__top">
            <span>Internships</span>
            <div className="ip-sad-metric__ico ip-sad-metric__ico--green">
              <Briefcase size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-sad-metric__row">
            <strong>{internshipsTotal}</strong>
            <span className="ip-sad-pill ip-sad-pill--ok">{internshipsLive} Live</span>
          </div>
          <p className="ip-sad-metric__sub">Active campus postings</p>
        </div>

        <div className="ip-sad-metric">
          <div className="ip-sad-metric__top">
            <span>Applications</span>
            <div className="ip-sad-metric__ico ip-sad-metric__ico--purple">
              <FileText size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-sad-metric__row">
            <strong>{applications}</strong>
            <span className="ip-sad-pill ip-sad-pill--brand">
              {offersAccepted}/{offersTotal} Accepted
            </span>
          </div>
          <p className="ip-sad-metric__sub">Total submitted applications</p>
        </div>
      </div>

      {firstPending ? (
        <div className="ip-sad-alert">
          <div className="ip-sad-alert__main">
            <div className="ip-sad-alert__ico">
              <ShieldAlert size={20} aria-hidden />
            </div>
            <div>
              <h4>Action Required: Pending Employer Approval</h4>
              <p>
                {firstPending.name} ({domainFromEmployer(firstPending)}) registered and requires document review before
                unlocking postings.
              </p>
            </div>
          </div>
          <button type="button" className="ip-sad-alert-btn" onClick={() => setSelectedApproval(firstPending)}>
            Review Account
            <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="ip-sad-card">
        <div className="ip-sad-card-head">
          <div>
            <h2>Operations Triage Hub</h2>
            <p>Open queues, triage support threads, and manage platform moderation tasks.</p>
          </div>
          <div className="ip-sad-search">
            <Search size={15} aria-hidden />
            <input
              type="search"
              placeholder="Search operational queues…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search operational queues"
            />
          </div>
        </div>

        {!filteredQueues.length ? (
          <div className="ip-sad-empty">No matching operational queues.</div>
        ) : (
          <div className="ip-sad-table-wrap">
            <table className="ip-sad-table">
              <thead>
                <tr>
                  <th>Operational Area</th>
                  <th>Description</th>
                  <th>Queue Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueues.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="ip-sad-area">
                        <span className="ip-sad-dot" aria-hidden />
                        <span>{item.area}</span>
                      </div>
                    </td>
                    <td className="ip-sad-desc">{item.desc}</td>
                    <td>
                      <span className={`ip-sad-pill ${item.badgeClass}`}>{item.badge}</span>
                    </td>
                    <td className="ip-sad-action">
                      {item.openModal ? (
                        <button type="button" onClick={() => setSelectedApproval(firstPending)}>
                          {item.action}
                          <ArrowUpRight size={13} aria-hidden />
                        </button>
                      ) : (
                        <Link href={item.href}>
                          {item.action}
                          <ArrowUpRight size={13} aria-hidden />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedApproval ? (
        <div className="ip-sad-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-sad-approve-title">
          <div className="ip-sad-modal">
            <div className="ip-sad-modal__head">
              <div className="ip-sad-modal__title">
                <div className="ip-sad-modal__ico">
                  <ShieldAlert size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-sad-approve-title">Review Employer Registration</h3>
                  <span>SuperAdmin Approval Queue</span>
                </div>
              </div>
              <button
                type="button"
                className="ip-sad-modal-close"
                aria-label="Close"
                onClick={() => setSelectedApproval(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="ip-sad-modal-body">
              <div className="ip-sad-modal-row">
                <span>Organization Name:</span>
                <strong>{selectedApproval.name}</strong>
              </div>
              <div className="ip-sad-modal-row">
                <span>Domain / Email:</span>
                <strong>{selectedApproval.contact}</strong>
              </div>
              <div className="ip-sad-modal-row">
                <span>Uploaded Verification:</span>
                <strong>{selectedApproval.docs}</strong>
              </div>
              <div className="ip-sad-modal-row">
                <span>Registration Date:</span>
                <strong>
                  {selectedApproval.date ? new Date(selectedApproval.date).toLocaleDateString() : '—'}
                </strong>
              </div>
            </div>

            <div className="ip-sad-modal-hint">
              <Info size={16} aria-hidden />
              <span>
                Approving this account enables full internship posting privileges and candidate search access.
              </span>
            </div>

            <div className="ip-sad-modal-actions">
              <button
                type="button"
                className="ip-sad-btn-reject"
                disabled={busy}
                onClick={() => setEmployerStatus(selectedApproval.id, 'rejected')}
              >
                Reject Registration
              </button>
              <button
                type="button"
                className="ip-sad-btn-approve"
                disabled={busy}
                onClick={() => setEmployerStatus(selectedApproval.id, 'approved')}
              >
                <CheckCircle2 size={15} aria-hidden />
                Approve Employer Account
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
