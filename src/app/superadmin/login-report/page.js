'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';
import '@/components/ip/ip-list-pager.css';
import IpListPager from '@/components/ip/IpListPager';
import { IpListEmpty, IpListLoading } from '@/components/ip/IpListStatus';
import { useClientPagination } from '@/hooks/useClientPagination';
import { SA_PAGE_SIZE } from '@/lib/ipSuperadminList';

function rolePill(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin') return 'ip-saq-pill--brand';
  if (r === 'employer') return 'ip-saq-pill--blue';
  if (r === 'candidate') return 'ip-saq-pill--slate';
  return 'ip-saq-pill--slate';
}

export default function LoginReportPage() {
  const [range, setRange] = useState('all');
  const [roleTab, setRoleTab] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({
    total: 0,
    success: 0,
    failed: 0,
    activeSessions: 0,
    successRate: '0%',
  });
  const [rangeTotals, setRangeTotals] = useState({ '24h': 0, '7d': 0, '30d': 0, all: 0 });
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadRangeTotals() {
    try {
      const ranges = ['24h', '7d', '30d', 'all'];
      const entries = await Promise.all(
        ranges.map(async (r) => {
          const res = await fetch(`/api/ip/superadmin/login-report?range=${r}&meta=1`);
          const data = await res.json();
          return [r, Number(data?.meta?.total || 0)];
        }),
      );
      setRangeTotals(Object.fromEntries(entries));
    } catch {
      /* ignore */
    }
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/login-report?range=${range}&meta=1`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load');
        setItems([]);
      } else {
        setItems(data.items || []);
        if (data.meta) setMeta(data.meta);
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRangeTotals();
  }, []);

  const roleCounts = useMemo(() => {
    const employers = items.filter((e) => e.role === 'employer').length;
    const candidates = items.filter((e) => e.role === 'candidate').length;
    const superadmins = items.filter((e) => e.role === 'superadmin').length;
    return { all: items.length, employers, candidates, superadmins };
  }, [items]);

  const filtered = useMemo(() => {
    let rows = items;
    if (roleTab === 'employer') rows = rows.filter((e) => e.role === 'employer');
    if (roleTab === 'candidate') rows = rows.filter((e) => e.role === 'candidate');
    if (roleTab === 'superadmin') rows = rows.filter((e) => e.role === 'superadmin');
    if (resultFilter === 'success') rows = rows.filter((e) => e.success);
    if (resultFilter === 'failed') rows = rows.filter((e) => !e.success);
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) =>
      [e.email, e.ip_address, e.location, e.device_label, e.auth_label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [items, roleTab, resultFilter, search]);

  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(
    filtered,
    SA_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(1);
  }, [range, roleTab, resultFilter, search, setPage]);

  return (
    <div className="ip-sa-q ip-mobile-bleed">
      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Login Report</h1>
            <span className="ip-saq-pill ip-saq-pill--ok">System Operational</span>
          </div>
          <p>Real-time authentication activity, IP tracking, and role audit logs across all platform users.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="ip-saq-select" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Time range">
            <option value="24h">Last 24 Hours ({rangeTotals['24h']} Events)</option>
            <option value="7d">Last 7 Days ({rangeTotals['7d']} Events)</option>
            <option value="30d">Last 30 Days ({rangeTotals['30d']} Events)</option>
            <option value="all">All Time ({rangeTotals.all} Events)</option>
          </select>
          <button type="button" className="ip-saq-btn ip-saq-btn--icon" aria-label="Refresh" disabled={loading} onClick={load}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total Auth Events</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <Activity size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.total ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Recorded</span>
          </div>
          <p className="ip-saq-metric__sub">Recorded authentication requests</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Active Sessions</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <Users size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.activeSessions ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Live Now</span>
          </div>
          <p className="ip-saq-metric__sub">Seen in last 30 minutes</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Successful Logins</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <ShieldCheck size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.success ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">{meta.successRate || '0%'} Rate</span>
          </div>
          <p className="ip-saq-metric__sub">Valid credential matches</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Failed / Flagged</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--rose">
              <ShieldAlert size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{meta.failed ?? 0}</strong>
            <span className="ip-saq-pill ip-saq-pill--danger">Action Logged</span>
          </div>
          <p className="ip-saq-metric__sub">Bad password and failed attempts</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {[
              { id: 'all', label: `All Roles (${roleCounts.all})` },
              { id: 'employer', label: `Employers (${roleCounts.employers})` },
              { id: 'candidate', label: `Candidates (${roleCounts.candidates})` },
              { id: 'superadmin', label: `SuperAdmins (${roleCounts.superadmins})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ip-saq-tab${roleTab === t.id ? ' ip-saq-tab--on' : ''}`}
                onClick={() => {
                  setRoleTab(t.id);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              className="ip-saq-select"
              value={resultFilter}
              onChange={(e) => {
                setResultFilter(e.target.value);
              }}
              aria-label="Result filter"
            >
              <option value="all">All Results</option>
              <option value="success">Success only</option>
              <option value="failed">Failed only</option>
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search email, IP, location..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <IpListLoading label="Loading Login Report…" />
        ) : !filtered.length ? (
          <IpListEmpty
            icon={Activity}
            title="No Auth Events In This View"
            hint="Successful And Failed Sign-Ins Will Appear Here As Users Authenticate."
          />
        ) : (
          <>
            <div className="ip-saq-table-wrap">
              <table className="ip-ph-list ip-saq-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>When</th>
                    <th>User Email</th>
                    <th>Role</th>
                    <th>IP &amp; Location</th>
                    <th>Device &amp; Auth</th>
                    <th>Result</th>
                    <th style={{ textAlign: 'right' }}>Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((ev, idx) => (
                    <tr key={ev.id}>
                      <td style={{ color: '#94a3b8' }}>{serialOffset + idx + 1}</td>
                      <td>{ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}</td>
                      <td>{ev.email || '—'}</td>
                      <td>
                        <span className={`ip-saq-pill ${rolePill(ev.role)}`}>
                          {String(ev.role || '—').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <strong style={{ display: 'block' }}>{ev.ip_address || '—'}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                          {ev.location || 'Location unknown'}
                        </span>
                      </td>
                      <td>
                        <strong style={{ display: 'block' }}>{ev.device_label || '—'}</strong>
                        <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>{ev.auth_label || 'Password Form'}</span>
                      </td>
                      <td>
                        <span className={`ip-saq-pill ${ev.success ? 'ip-saq-pill--ok' : 'ip-saq-pill--danger'}`}>
                          {ev.success ? 'success' : 'failed'}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => setInspect(ev)}>
                          <Eye size={14} aria-hidden />
                          Inspect
                        </button>
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

      {inspect ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true">
          <div className="ip-saq-modal">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Eye size={18} aria-hidden />
                </div>
                <div>
                  <h3>Inspect auth event</h3>
                  <span>{inspect.email}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" onClick={() => setInspect(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <div className="ip-saq-modal-row">
                <span>When</span>
                <strong>{inspect.created_at ? new Date(inspect.created_at).toLocaleString() : '—'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Role</span>
                <strong>{inspect.role || '—'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Result</span>
                <strong>{inspect.success ? 'success' : 'failed'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>IP</span>
                <strong>{inspect.ip_address || '—'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Location</span>
                <strong>{inspect.location || 'Unknown'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Device</span>
                <strong>{inspect.device_label || '—'}</strong>
              </div>
              <div className="ip-saq-modal-row">
                <span>Auth</span>
                <strong>{inspect.auth_label || '—'}</strong>
              </div>
              {inspect.user_agent ? (
                <div className="ip-saq-modal-row">
                  <span>User-Agent</span>
                  <strong style={{ fontSize: '0.65rem', wordBreak: 'break-all' }}>{inspect.user_agent}</strong>
                </div>
              ) : null}
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setInspect(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
