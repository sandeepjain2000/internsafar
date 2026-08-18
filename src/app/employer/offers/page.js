'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Send,
  TrendingUp,
} from 'lucide-react';
import '@/components/ip/ip-employer-offers-gemini.css';

const TABS = ['All', 'Pending', 'Accepted', 'Declined'];
const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function isExpiredPending(o) {
  if (String(o.status || '').toLowerCase() !== 'pending' || !o.valid_until) return false;
  const until = new Date(o.valid_until);
  return !Number.isNaN(until.getTime()) && until.getTime() < Date.now();
}

function displayStatus(o) {
  const s = String(o.status || '').toLowerCase();
  if (isExpiredPending(o)) return { key: 'expired', label: 'Expired', className: 'ip-eo-badge--muted' };
  if (s === 'accepted') return { key: 'accepted', label: 'Accepted', className: 'ip-eo-badge--ok' };
  if (s === 'declined') return { key: 'declined', label: 'Declined', className: 'ip-eo-badge--bad' };
  if (s === 'pending') return { key: 'pending', label: 'Pending Acceptance', className: 'ip-eo-badge--warn' };
  return { key: s || 'other', label: o.status || '—', className: 'ip-eo-badge--muted' };
}

function stipendLabel(o) {
  if (o.stipend_inr == null || o.stipend_inr === '') return '—';
  return `₹${Number(o.stipend_inr).toLocaleString('en-IN')}/mo`;
}

function startLabel(o) {
  if (!o.start_date) return '—';
  try {
    return new Date(o.start_date).toLocaleDateString();
  } catch {
    return '—';
  }
}

function daysUntil(dateVal) {
  if (!dateVal) return null;
  const t = new Date(dateVal).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

function remindBlockedReason(o) {
  if (String(o.status || '').toLowerCase() !== 'pending') {
    return 'Remind only applies while the offer is still pending.';
  }
  if (isExpiredPending(o)) {
    return 'This offer has expired — send a new offer instead.';
  }
  if (o.last_reminded_at) {
    const last = new Date(o.last_reminded_at).getTime();
    const remaining = REMIND_COOLDOWN_MS - (Date.now() - last);
    if (remaining > 0) {
      const hours = Math.ceil(remaining / (60 * 60 * 1000));
      return `Already reminded recently. Try again in about ${hours} hour${hours === 1 ? '' : 's'}.`;
    }
  }
  return null;
}

function weekStartMs() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export default function EmployerOffersPage() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusOk, setStatusOk] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [letterOffer, setLetterOffer] = useState(null);
  const [endorseFor, setEndorseFor] = useState(null);
  const [endorseForm, setEndorseForm] = useState({ periodLabel: '', skillsEndorsed: '' });
  const [rateFor, setRateFor] = useState(null);
  const [stars, setStars] = useState(5);

  async function load() {
    const res = await fetch('/api/ip/offers');
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const total = items.length;
    const accepted = items.filter((o) => String(o.status).toLowerCase() === 'accepted');
    const pendingLive = items.filter(
      (o) => String(o.status).toLowerCase() === 'pending' && !isExpiredPending(o),
    );
    const thisWeek = items.filter((o) => {
      const c = new Date(o.created_at).getTime();
      return !Number.isNaN(c) && c >= weekStartMs();
    }).length;
    const conversion = total ? Math.round((accepted.length / total) * 1000) / 10 : 0;
    let pendingHint = 'None waiting';
    if (pendingLive.length) {
      const soonest = pendingLive
        .map((o) => daysUntil(o.valid_until))
        .filter((d) => d != null && d >= 0)
        .sort((a, b) => a - b)[0];
      pendingHint =
        soonest != null
          ? `Expires in ${soonest} day${soonest === 1 ? '' : 's'}`
          : `${pendingLive.length} awaiting response`;
    }
    return {
      total,
      acceptedCount: accepted.length,
      acceptedName: accepted[0]?.candidate_name || null,
      pendingCount: pendingLive.length,
      pendingHint,
      thisWeek,
      conversion,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((o) => {
      const st = displayStatus(o).key;
      if (tab === 'Pending' && st !== 'pending') return false;
      if (tab === 'Accepted' && st !== 'accepted') return false;
      if (tab === 'Declined' && st !== 'declined') return false;
      if (!needle) return true;
      const hay = `${o.candidate_name || ''} ${o.role_title || ''} ${o.title || ''} ${o.candidate_college || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, tab, q]);

  async function remind(o) {
    const blocked = remindBlockedReason(o);
    if (blocked) {
      setStatusOk(false);
      setStatusMsg(blocked);
      return;
    }
    setBusyId(o.id);
    setStatusMsg('');
    try {
      const res = await fetch(`/api/ip/offers/${o.id}/remind`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusOk(false);
        setStatusMsg(data.error || 'Could not send reminder');
        return;
      }
      setStatusOk(true);
      setStatusMsg(`Reminder sent to ${o.candidate_name || 'candidate'} (in-app + email when configured).`);
      setItems((prev) =>
        prev.map((row) =>
          row.id === o.id ? { ...row, last_reminded_at: data.last_reminded_at || new Date().toISOString() } : row,
        ),
      );
    } catch {
      setStatusOk(false);
      setStatusMsg('Could not send reminder');
    } finally {
      setBusyId('');
    }
  }

  async function endorse() {
    if (!endorseFor) return;
    setBusyId(endorseFor.id);
    try {
      const res = await fetch('/api/ip/endorsements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateId: endorseFor.candidate_id,
          internshipId: endorseFor.internship_id,
          roleTitle: endorseFor.title,
          periodLabel: endorseForm.periodLabel,
          skillsEndorsed: endorseForm.skillsEndorsed.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusOk(false);
        setStatusMsg(data.error || 'Endorsement failed');
        return;
      }
      setStatusOk(true);
      setStatusMsg(`Endorsement saved for ${endorseFor.candidate_name}`);
      setEndorseFor(null);
      setEndorseForm({ periodLabel: '', skillsEndorsed: '' });
    } finally {
      setBusyId('');
    }
  }

  async function rate() {
    if (!rateFor) return;
    setBusyId(rateFor.id);
    try {
      const res = await fetch('/api/ip/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: rateFor.candidate_user_id,
          stars,
          internshipId: rateFor.internship_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatusOk(false);
        setStatusMsg(data.error || 'Rating failed');
        return;
      }
      setStatusOk(true);
      setStatusMsg(`Rating submitted for ${rateFor.candidate_name}`);
      setRateFor(null);
    } finally {
      setBusyId('');
    }
  }

  function openLetter(o) {
    if (o.letter_url) {
      window.open(o.letter_url, '_blank', 'noopener,noreferrer');
      return;
    }
    setLetterOffer(o);
  }

  return (
    <div className="ip-emp-offers">
      <div className="ip-eo-banner">
        <div>
          <h1>Offer Management & Conversion Pipeline</h1>
          <p>Track candidate contract statuses, review acceptance rates, and manage formal internship offers.</p>
        </div>
        <div className="ip-eo-banner-actions">
          <span className="ip-eo-conv">
            <TrendingUp size={16} aria-hidden />
            {metrics.total ? `${metrics.conversion}% Conversion Rate` : 'No offers yet'}
          </span>
          <Link className="ip-eo-btn-primary" href="/employer/internships">
            <Plus size={15} aria-hidden />
            Extend New Offer
          </Link>
        </div>
      </div>

      {statusMsg ? (
        <div className={`ip-eo-alert ${statusOk ? 'ip-eo-alert--ok' : 'ip-eo-alert--err'}`} role="status">
          {statusMsg}
        </div>
      ) : null}

      <div className="ip-eo-metrics">
        <div className="ip-eo-metric">
          <div>
            <p>Total Offers Sent</p>
            <h3>{metrics.total}</h3>
            <span className="ip-eo-metric-sub ip-eo-metric-sub--ok">
              {metrics.thisWeek ? `+${metrics.thisWeek} this week` : 'None this week'}
            </span>
          </div>
          <div className="ip-eo-metric-icon ip-eo-metric-icon--brand">
            <Send size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-eo-metric">
          <div>
            <p>Accepted Offers</p>
            <h3>{metrics.acceptedCount}</h3>
            <span className="ip-eo-metric-sub ip-eo-metric-sub--ok">
              {metrics.acceptedName || 'No acceptances yet'}
            </span>
          </div>
          <div className="ip-eo-metric-icon ip-eo-metric-icon--ok">
            <CheckCircle2 size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-eo-metric">
          <div>
            <p>Pending Response</p>
            <h3>{metrics.pendingCount}</h3>
            <span className="ip-eo-metric-sub ip-eo-metric-sub--warn">{metrics.pendingHint}</span>
          </div>
          <div className="ip-eo-metric-icon ip-eo-metric-icon--warn">
            <Clock size={22} aria-hidden />
          </div>
        </div>
      </div>

      <div className="ip-eo-panel">
        <div className="ip-eo-toolbar">
          <div className="ip-eo-tabs" role="tablist" aria-label="Offer status">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={`ip-eo-tab${tab === t ? ' ip-eo-tab--on' : ''}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="ip-eo-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search candidate or role..."
              aria-label="Search candidate or role"
            />
          </div>
        </div>

        <div className="ip-eo-table-wrap">
          <table className="ip-eo-table">
            <thead>
              <tr>
                <th>Candidate & Role</th>
                <th>Stipend</th>
                <th>Start Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="ip-eo-empty">
                    {items.length
                      ? 'No offers match the selected filter.'
                      : 'No offers yet — send one from a posting’s applicant list or Search Candidates.'}
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const st = displayStatus(o);
                  const canRemind = st.key === 'pending' && !remindBlockedReason(o);
                  const remindHint = remindBlockedReason(o);
                  return (
                    <tr key={o.id}>
                      <td>
                        <div className="ip-eo-cand">
                          <div className="ip-eo-avatar" aria-hidden>
                            {initials(o.candidate_name)}
                          </div>
                          <div>
                            <h4>{o.candidate_name || 'Candidate'}</h4>
                            <p>
                              {o.role_title || o.title || 'Role'}
                              {o.candidate_college ? (
                                <>
                                  {' '}
                                  · <span>{o.candidate_college}</span>
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="ip-eo-stipend">{stipendLabel(o)}</td>
                      <td className="ip-eo-date">{startLabel(o)}</td>
                      <td>
                        <span className={`ip-eo-badge ${st.className}`}>{st.label}</span>
                      </td>
                      <td>
                        <div className="ip-eo-actions">
                          <button type="button" className="ip-eo-btn-letter" onClick={() => openLetter(o)}>
                            View Letter
                          </button>
                          {st.key === 'pending' ? (
                            <button
                              type="button"
                              className="ip-eo-btn-remind"
                              disabled={!canRemind || busyId === o.id}
                              title={remindHint || 'Send in-app + email reminder'}
                              onClick={() => remind(o)}
                            >
                              {busyId === o.id ? 'Sending…' : 'Remind'}
                            </button>
                          ) : null}
                          {st.key === 'accepted' ? (
                            <>
                              <button
                                type="button"
                                className="ip-eo-btn-ghost"
                                onClick={() => {
                                  setEndorseFor(o);
                                  setEndorseForm({ periodLabel: '', skillsEndorsed: '' });
                                }}
                              >
                                Endorse
                              </button>
                              <button
                                type="button"
                                className="ip-eo-btn-ghost"
                                onClick={() => {
                                  setRateFor(o);
                                  setStars(5);
                                }}
                              >
                                Rate
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {letterOffer ? (
        <div className="ip-eo-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-eo-letter-title">
          <div className="ip-eo-modal">
            <h2 id="ip-eo-letter-title">Offer details — {letterOffer.candidate_name}</h2>
            <p>
              <strong>{letterOffer.role_title || letterOffer.title}</strong>
              {letterOffer.stipend_inr != null ? ` · ${stipendLabel(letterOffer)}` : ''}
              {letterOffer.valid_until
                ? ` · Valid until ${new Date(letterOffer.valid_until).toLocaleDateString()}`
                : ''}
            </p>
            {letterOffer.message ? (
              <p>{letterOffer.message}</p>
            ) : (
              <p>No letter URL or message was attached when this offer was sent.</p>
            )}
            <div className="ip-eo-modal-actions">
              <button type="button" className="ip-eo-btn-ghost" onClick={() => setLetterOffer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {endorseFor ? (
        <div className="ip-eo-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-eo-endorse-title">
          <div className="ip-eo-modal">
            <h2 id="ip-eo-endorse-title">Endorse {endorseFor.candidate_name}</h2>
            <label htmlFor="ip-eo-period">Period (e.g. Jan–Mar 2026)</label>
            <input
              id="ip-eo-period"
              value={endorseForm.periodLabel}
              onChange={(e) => setEndorseForm((f) => ({ ...f, periodLabel: e.target.value }))}
            />
            <label htmlFor="ip-eo-skills">Skills endorsed (comma separated)</label>
            <textarea
              id="ip-eo-skills"
              rows={2}
              value={endorseForm.skillsEndorsed}
              onChange={(e) => setEndorseForm((f) => ({ ...f, skillsEndorsed: e.target.value }))}
            />
            <div className="ip-eo-modal-actions">
              <button type="button" className="ip-eo-btn-ghost" onClick={() => setEndorseFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-eo-btn-primary"
                disabled={busyId === endorseFor.id}
                onClick={endorse}
              >
                Generate endorsement
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rateFor ? (
        <div className="ip-eo-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-eo-rate-title">
          <div className="ip-eo-modal">
            <h2 id="ip-eo-rate-title">Rate {rateFor.candidate_name}</h2>
            <div className="ip-eo-stars" role="group" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n <= stars ? 'on' : 'off'}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  onClick={() => setStars(n)}
                >
                  ★
                </button>
              ))}
            </div>
            <div className="ip-eo-modal-actions">
              <button type="button" className="ip-eo-btn-ghost" onClick={() => setRateFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-eo-btn-primary"
                disabled={busyId === rateFor.id}
                onClick={rate}
              >
                Submit rating
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
