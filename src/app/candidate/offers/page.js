'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Inbox,
  MessageCircle,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { normalizePrefsFilters, useListPrefsSync } from '@/hooks/useListPrefsSync';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import { sanitizeMessageHtml } from '@/lib/ipRichText';
import '@/components/ip/ip-offers-gemini.css';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { formatStatus } from '@/lib/utils';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpTablePagination from '@/components/ip/IpTablePagination';

const PAGE_SIZE = 10;

const WORK_MODE_OPTIONS = [
  { value: '', label: 'Any work mode' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'On-site', label: 'On-site' },
];

const STIPEND_OPTIONS = [
  { value: '0', label: 'Any stipend' },
  { value: '10000', label: '₹10,000+ / mo' },
  { value: '15000', label: '₹15,000+ / mo' },
  { value: '20000', label: '₹20,000+ / mo' },
];

const VALID_UNTIL_OPTIONS = [
  { value: '', label: 'Any deadline' },
  { value: '7', label: 'Expires within 7 days' },
  { value: '14', label: 'Expires within 14 days' },
  { value: '30', label: 'Expires within 30 days' },
];

const START_OPTIONS = [
  { value: '', label: 'Any start' },
  { value: '30', label: 'Starts within 30 days' },
  { value: '60', label: 'Starts within 60 days' },
  { value: '90', label: 'Starts within 90 days' },
];


function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function badgeClass(key) {
  if (key === 'action_required') return 'ip-of-badge--warn';
  if (key === 'accepted') return 'ip-of-badge--ok';
  if (key === 'declined') return 'ip-of-badge--bad';
  return 'ip-of-badge--muted';
}

function roleLabel(o) {
  return o.role_title || o.title || 'Internship offer';
}

function offerShareSummary(o) {
  const lines = [
    `Internship offer: ${roleLabel(o)}`,
    o.company_name ? `Company: ${o.company_name}` : null,
    o.stipend_label ? `Stipend: ${o.stipend_label}` : null,
    o.work_mode_label ? `Work mode: ${o.work_mode_label}` : null,
    o.duration_label ? `Duration: ${o.duration_label}` : null,
    o.start_date_label ? `Start: ${o.start_date_label}` : null,
    o.expiry_date_label ? `Respond by: ${o.expiry_date_label}` : null,
    o.display_status_label ? `Status: ${o.display_status_label}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function whatsappShareHref(o) {
  return `https://wa.me/?text=${encodeURIComponent(offerShareSummary(o))}`;
}

const TABS = [
  { id: 'all', label: 'All Offers' },
  { id: 'action_required', label: 'Action Required', dot: 'warn' },
  { id: 'accepted', label: 'Accepted', dot: 'ok' },
  { id: 'declined', label: 'Declined', dot: 'bad' },
  { id: 'expired', label: 'Expired', dot: 'muted' },
];

export default function CandidateOffersPage() {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [rateFor, setRateFor] = useState(null);
  const [stars, setStars] = useState(5);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('all');
  const [employers, setEmployers] = useState([]);
  const [minStipend, setMinStipend] = useState('0');
  const [workMode, setWorkMode] = useState('');
  const [validWithin, setValidWithin] = useState('');
  const [startWithin, setStartWithin] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const [detailOffer, setDetailOffer] = useState(null);
  const [offerFromUrl, setOfferFromUrl] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [viewMode, setViewMode] = useViewMode('ip_offers_view', 'list');

  const snapshot = useMemo(
    () => ({
      filters: { q, tab, employers, minStipend, workMode, validWithin, startWithin },
      sort: '',
    }),
    [q, tab, employers, minStipend, workMode, validWithin, startWithin],
  );
  const prefs = useListPrefsSync({
    tableKey: 'candidate.offers',
    snapshot,
    applySnapshot: (s) => {
      const f = normalizePrefsFilters(s?.filters);
      setQ(f.q != null ? String(f.q) : '');
      setTab(f.tab != null && f.tab !== '' ? String(f.tab) : 'all');
      setEmployers(Array.isArray(f.employers) ? f.employers.map(String) : []);
      setMinStipend(f.minStipend != null ? String(f.minStipend) : '0');
      setWorkMode(f.workMode != null ? String(f.workMode) : '');
      setValidWithin(f.validWithin != null ? String(f.validWithin) : '');
      setStartWithin(f.startWithin != null ? String(f.startWithin) : '');
      if (
        (Array.isArray(f.employers) && f.employers.length)
        || (f.minStipend && Number(f.minStipend) > 0)
        || f.workMode
        || f.validWithin
        || f.startWithin
      ) {
        setAdvancedOpen(true);
      }
    },
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/ip/offers');
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    try {
      setOfferFromUrl(new URLSearchParams(window.location.search).get('offer') || '');
    } catch {
      setOfferFromUrl('');
    }
  }, []);

  useEffect(() => {
    if (!offerFromUrl || !items.length) return;
    const hit = items.find((o) => String(o.id) === String(offerFromUrl));
    if (hit) {
      setDetailOffer(hit);
      if (hit.display_tab && hit.display_tab !== 'all') setTab(hit.display_tab);
    }
  }, [offerFromUrl, items]);

  const counts = useMemo(() => {
    const c = { all: items.length, action_required: 0, accepted: 0, declined: 0, expired: 0 };
    items.forEach((o) => {
      const t = o.display_tab || 'all';
      if (c[t] != null) c[t] += 1;
    });
    return c;
  }, [items]);

  const employerOptions = useMemo(() => {
    const map = new Map();
    for (const o of items) {
      const c = String(o.company_name || '').trim();
      if (!c) continue;
      const key = c.toLowerCase();
      if (!map.has(key)) map.set(key, { value: c, label: c });
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [items]);

  const advancedActive = Boolean(
    employers.length
    || Number(minStipend) > 0
    || workMode
    || validWithin
    || startWithin,
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const empSet = new Set(employers.map((v) => String(v).toLowerCase()));
    const stipendFloor = Number(minStipend) || 0;
    const modeNeedle = String(workMode || '').toLowerCase().replace(/[\s_-]/g, '');
    const days = Number(validWithin) || 0;
    const startDays = Number(startWithin) || 0;
    const now = Date.now();
    return items.filter((o) => {
      if (tab !== 'all' && o.display_tab !== tab) return false;
      if (empSet.size) {
        const company = String(o.company_name || '').toLowerCase();
        if (!empSet.has(company)) return false;
      }
      if (stipendFloor) {
        const stipend = Number(o.stipend_inr ?? o.internship_stipend_inr ?? 0);
        if (stipend < stipendFloor) return false;
      }
      if (modeNeedle) {
        const mode = String(o.work_mode_label || o.work_mode || '').toLowerCase().replace(/[\s_-]/g, '');
        if (modeNeedle === 'onsite') {
          if (!mode.includes('onsite')) return false;
        } else if (!mode.includes(modeNeedle)) {
          return false;
        }
      }
      if (days) {
        const raw = o.valid_until || o.expiry_date;
        if (!raw) return false;
        const t = new Date(raw).getTime();
        if (Number.isNaN(t) || t < now || t > now + days * 86400000) return false;
      }
      if (startDays) {
        const raw = o.start_date;
        if (!raw) return false;
        const t = new Date(raw).getTime();
        if (Number.isNaN(t) || t < now || t > now + startDays * 86400000) return false;
      }
      if (!needle) return true;
      const hay = [
        o.role_title,
        o.title,
        o.company_name,
        o.work_mode,
        o.work_mode_label,
        o.location,
        o.recruiter_name,
        o.stipend_label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, tab, employers, minStipend, workMode, validWithin, startWithin]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(filtered, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [q, tab, employers, minStipend, workMode, validWithin, startWithin, setPage]);

  function resetFilters() {
    setQ('');
    setTab('all');
    setEmployers([]);
    setMinStipend('0');
    setWorkMode('');
    setValidWithin('');
    setStartWithin('');
    setAdvancedOpen(false);
  }

  const liveDetail = detailOffer
    ? items.find((o) => o.id === detailOffer.id) || detailOffer
    : null;

  async function respond(id, status) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/ip/offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update offer');
      setConfirm(null);
      showToast(status === 'accepted' ? 'Offer accepted. Employer notified.' : 'Offer declined. Employer notified.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  async function submitRating() {
    if (!rateFor?.employer_user_id) return;
    setBusyId(rateFor.id);
    try {
      await fetch('/api/ip/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toUserId: rateFor.employer_user_id,
          stars,
          internshipId: rateFor.internship_id,
        }),
      });
      setRateFor(null);
      showToast('Rating submitted');
    } finally {
      setBusyId('');
    }
  }

  function shareUrl() {
    return `${window.location.origin}/candidate/offers`;
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      showToast('Share link copied');
    } catch {
      showToast('Could not copy link');
    }
  }

  function shareLinkedIn() {
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl())}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  function shareWhatsApp(o) {
    window.open(whatsappShareHref(o), '_blank', 'noopener,noreferrer');
  }

  function messagesHref(o) {
    return o.thread_id
      ? `/candidate/messages?thread=${encodeURIComponent(o.thread_id)}`
      : '/candidate/messages';
  }

  function hasOnboarding(o) {
    return Boolean(o.onboarding_instructions || o.hr_email || o.hr_phone || o.mentor_name);
  }

  function openDetail(o) {
    setDetailOffer(o);
  }

  function renderOfferCard(o, { inModal = false } = {}) {
    const pending = o.display_status === 'action_required';
    const accepted = o.display_status === 'accepted';
    const role = roleLabel(o);
    return (
      <article key={o.id} className={`ip-of-card${inModal ? ' ip-of-card--modal' : ''}`}>
        <div className="ip-of-card__head">
          <div className="ip-of-identity">
            <div className="ip-of-logo">
              {o.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.logo_url} alt="" />
              ) : (
                initials(o.company_name)
              )}
            </div>
            <div>
              <h3>
                {inModal ? (
                  role
                ) : (
                  <button type="button" className="ip-of-role-btn" onClick={() => openDetail(o)}>
                    {role}
                  </button>
                )}
              </h3>
              <p className="ip-of-company">
                {o.company_name || 'Employer'}
                {o.employer_verified ? (
                  <span className="ip-of-verified">Verified Employer</span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="ip-of-head-meta">
            <span className={`ip-of-badge ${badgeClass(o.display_status)}`}>
              {o.display_status_label}
            </span>
            {o.expiry_date_label || o.days_remaining_label ? (
              <p className="ip-of-expires">
                {pending && o.expiry_date_label ? `Offer expires: ${o.expiry_date_label}` : null}
                {o.days_remaining_label ? (
                  <>
                    {pending && o.expiry_date_label ? ' | ' : null}
                    {o.days_remaining_label}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <div className="ip-of-body">
          <div>
            <div className="ip-of-terms-label">
              Official Offer Terms
              <span>From the employer</span>
            </div>
            <dl className="ip-of-grid">
              <div>
                <dt>Monthly Stipend</dt>
                <dd>{o.stipend_label || '—'}</dd>
              </div>
              <div>
                <dt>Work Mode &amp; Location</dt>
                <dd>{o.work_mode_label || '—'}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{o.duration_label || '—'}</dd>
              </div>
              <div>
                <dt>Start Date</dt>
                <dd>{o.start_date_label || '—'}</dd>
              </div>
              <div>
                <dt>End Date</dt>
                <dd>{o.end_date_label || '—'}</dd>
              </div>
              <div>
                <dt>Expiry Date</dt>
                <dd>{o.expiry_date_label || '—'}</dd>
              </div>
            </dl>
            <div className="ip-of-docs">
              {o.letter_url ? (
                <>
                  <a className="ip-of-btn ip-of-btn--primary" href={o.letter_url} target="_blank" rel="noreferrer">
                    <FileText className="size-4" />
                    View Offer Letter
                  </a>
                  <a className="ip-of-btn ip-of-btn--outline" href={o.letter_url} target="_blank" rel="noreferrer">
                    <Download className="size-4" />
                    Download Offer Letter
                  </a>
                </>
              ) : null}
              <button type="button" className="ip-of-btn ip-of-btn--ghost" onClick={() => setShareFor(o)}>
                <Share2 className="size-3.5" />
                Share Offer
              </button>
              <a
                className="ip-of-btn ip-of-btn--outline"
                href={whatsappShareHref(o)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="size-3.5" />
                WhatsApp
              </a>
            </div>
          </div>

          <div className="ip-of-note">
            <div>
              <div className="ip-of-recruiter">
                <div className="ip-of-avatar">{initials(o.recruiter_name || o.company_name)}</div>
                <div>
                  <strong>{o.recruiter_name || o.company_name || 'Recruiter'}</strong>
                  {o.recruiter_role ? <span>{o.recruiter_role}</span> : null}
                </div>
                <span className="ip-of-chip">Recruiter Note</span>
              </div>
                    <p>
                      {o.message ? (
                        <>
                          “
                          <span dangerouslySetInnerHTML={{ __html: sanitizeMessageHtml(o.message) }} />
                          ”
                        </>
                      ) : (
                        'No recruiter note was attached to this offer.'
                      )}
                    </p>
            </div>
            <div className="ip-of-note-foot">
              <span>Employer thread</span>
              <Link href={messagesHref(o)}>
                <MessageSquare className="size-3.5" style={{ display: 'inline', verticalAlign: '-2px' }} /> View Conversation
              </Link>
            </div>
          </div>
        </div>

        {pending ? (
          <div className="ip-of-foot">
            <p className="ip-of-hint">
              Please review formal terms and submit your response
              {o.expiry_date_label ? <> before <strong>{o.expiry_date_label}</strong></> : null}.
            </p>
            <div className="ip-of-actions">
              <button
                type="button"
                className="ip-of-btn ip-of-btn--danger"
                disabled={busyId === o.id}
                onClick={() => setConfirm({ offer: o, action: 'declined' })}
              >
                <X className="size-4" />
                Decline Offer
              </button>
              <button
                type="button"
                className="ip-of-btn ip-of-btn--success"
                disabled={busyId === o.id}
                onClick={() => setConfirm({ offer: o, action: 'accepted' })}
              >
                <CheckCircle2 className="size-4" />
                Accept Offer
              </button>
            </div>
          </div>
        ) : null}

        {accepted ? (
          <div className="ip-of-foot ip-of-foot--ok">
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div className="ip-of-accepted-title">
                  <div className="ip-of-check">
                    <Check className="size-5" />
                  </div>
                  <div>
                    <h4>Offer Accepted — you&apos;re set for your internship!</h4>
                    <p>The employer has been formally notified of your acceptance.</p>
                  </div>
                </div>
                {o.start_date_label ? (
                  <span className="ip-of-badge ip-of-badge--ok">Starts: {o.start_date_label}</span>
                ) : null}
              </div>
              {hasOnboarding(o) ? (
                <div className="ip-of-onboard">
                  <div>
                    <h4>Onboarding Instructions</h4>
                    <p>{o.onboarding_instructions || 'The employer has not added first-day instructions yet.'}</p>
                  </div>
                  <div>
                    <h4>Employer HR Contact</h4>
                    <p>{o.hr_email || '—'}</p>
                    <p>{o.hr_phone || ''}</p>
                  </div>
                  <div>
                    <h4>Assigned Tech Lead / Mentor</h4>
                    <p>{o.mentor_name || 'Not assigned yet.'}</p>
                    <Link href={messagesHref(o)} className="ip-of-btn ip-of-btn--ghost" style={{ marginTop: '0.5rem' }}>
                      Reach out on Messages
                    </Link>
                  </div>
                </div>
              ) : (
                <Link href={messagesHref(o)} className="ip-of-btn ip-of-btn--outline" style={{ width: 'fit-content' }}>
                  Reach out on Messages
                </Link>
              )}
              {o.employer_user_id ? (
                <button
                  type="button"
                  className="ip-of-btn ip-of-btn--outline"
                  style={{ width: 'fit-content' }}
                  disabled={busyId === o.id}
                  onClick={() => {
                    setRateFor(o);
                    setStars(5);
                  }}
                >
                  Rate employer
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {o.display_status === 'declined' ? (
          <div className="ip-of-foot">
            <p className="ip-of-hint">
              This offer was declined. Employer has been notified. <strong>No further action is available.</strong>
            </p>
            <span className="ip-of-expires" style={{ fontFamily: 'ui-monospace, monospace' }}>{o.id}</span>
          </div>
        ) : null}

        {o.display_status === 'expired' ? (
          <div className="ip-of-foot">
            <p className="ip-of-hint">
              This offer passed its deadline
              {o.expiry_date_label ? <> on <strong>{o.expiry_date_label}</strong></> : null} and has expired.
              Accept/Decline actions are disabled.
            </p>
            <span className="ip-of-badge ip-of-badge--muted">Expired</span>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="ip-offers">
      {toast ? <div className="ip-of-toast">{toast}</div> : null}

      <div className="ip-of-header">
        <div>
          <h1>Offers</h1>
          <p>Review, accept or decline official internship offers extended by recruiters.</p>
        </div>
        <div className="ip-of-tools">
          <div className="ip-of-search">
            <Search aria-hidden />
            <input
              type="search"
              placeholder="Search offers..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search offers"
            />
          </div>
          <button
            type="button"
            className={`ip-of-reset${advancedOpen || advancedActive ? ' is-on' : ''}`}
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Advanced filters
            {advancedActive ? <span className="ip-of-adv-on">On</span> : null}
          </button>
          <button
            type="button"
            className="ip-of-reset"
            onClick={resetFilters}
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        </div>
      </div>

      {advancedOpen ? (
        <div className="ip-of-advanced" role="region" aria-label="Advanced offer filters">
          <label className="ip-of-advanced__field">
            <span>Employer</span>
            <SearchableMultiSelect
              options={employerOptions}
              value={employers}
              onChange={setEmployers}
              placeholder="Search employers…"
              ariaLabel="Filter by employer"
            />
          </label>
          <label className="ip-of-advanced__field">
            <span>Stipend</span>
            <select value={minStipend} onChange={(e) => setMinStipend(e.target.value)} aria-label="Minimum stipend">
              {STIPEND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="ip-of-advanced__field">
            <span>Work Mode / Location</span>
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Work mode">
              {WORK_MODE_OPTIONS.map((o) => (
                <option key={o.value || 'any'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="ip-of-advanced__field">
            <span>Start Date</span>
            <select value={startWithin} onChange={(e) => setStartWithin(e.target.value)} aria-label="Start date window">
              {START_OPTIONS.map((o) => (
                <option key={o.value || 'any'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="ip-of-advanced__field">
            <span>Valid Until</span>
            <select value={validWithin} onChange={(e) => setValidWithin(e.target.value)} aria-label="Valid until window">
              {VALID_UNTIL_OPTIONS.map((o) => (
                <option key={o.value || 'any'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <ListPresetsBar {...prefs} />

      <div className="ip-of-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ip-of-tab${tab === t.id ? ' ip-of-tab--on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.dot ? <span className={`ip-of-dot ip-of-dot--${t.dot}`} aria-hidden /> : null}
            <span>{t.label}</span>
            <span className="ip-of-count">{counts[t.id] || 0}</span>
          </button>
        ))}
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {error ? <div className="ip-of-alert">{error}</div> : null}

      {!loading && !filtered.length ? (
        <div className="ip-of-empty">
          <Inbox strokeWidth={1.5} className="size-10" style={{ margin: '0 auto', color: '#4f46e5' }} />
          <h3>{items.length ? 'No offers found' : 'No offers yet'}</h3>
          <p>
            {items.length
              ? 'There are no internship offers matching your current filter or search.'
              : "You haven't received any internship offers at the moment. Continue browsing and applying to open roles."}
          </p>
          {items.length ? (
            <button type="button" className="ip-of-btn ip-of-btn--primary" onClick={resetFilters}>
              Reset filters
            </button>
          ) : (
            <Link href="/candidate/internships" className="ip-of-btn ip-of-btn--primary">
              <Search className="size-4" />
              Browse Internships
            </Link>
          )}
        </div>
      ) : null}

      <div className={viewMode === 'list' ? 'ip-ph-list-wrap' : 'ip-of-list'}>
        {viewMode === 'list' ? (
          <table className="ip-ph-list">
            <thead>
              <tr>
                <th>Employer</th>
                <th>Stipend</th>
                <th>Start Date</th>
                <th>Valid Until</th>
                <th>Duration</th>
                <th>Work Mode / Location</th>
                <th>Status</th>
                <th>Role</th>
                <th>Share (WhatsApp)</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => (
                <tr key={o.id}>
                  <td>{o.company_name || '—'}</td>
                  <td>{o.stipend_label || '—'}</td>
                  <td>{o.start_date_label || '—'}</td>
                  <td>{o.expiry_date_label || '—'}</td>
                  <td>{o.duration_label || '—'}</td>
                  <td>{o.work_mode_label || '—'}</td>
                  <td>
                    <span className={`ip-of-badge ${badgeClass(o.display_status)}`}>
                      {o.display_status_label || formatStatus(o.display_status) || formatStatus(o.status)}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="ip-ph-role" onClick={() => openDetail(o)}>
                      {roleLabel(o)}
                    </button>
                  </td>
                  <td>
                    <div className="ip-of-list-share">
                      <button
                        type="button"
                        className="ip-of-icon-btn"
                        title="Share offer"
                        aria-label="Share offer"
                        onClick={() => setShareFor(o)}
                      >
                        <Share2 className="size-4" />
                      </button>
                      <a
                        className="ip-of-icon-btn"
                        href={whatsappShareHref(o)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Share on WhatsApp"
                        aria-label="Share on WhatsApp"
                      >
                        <MessageCircle className="size-4" />
                      </a>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ip-of-icon-btn"
                      title="View offer details"
                      aria-label={`View details for ${roleLabel(o)}`}
                      onClick={() => openDetail(o)}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          pageItems.map((o) => renderOfferCard(o))
        )}
      </div>

      {total > 0 ? (
        <IpTablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}

      {liveDetail ? (
        <div className="ip-of-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-of-detail-title">
          <div className="ip-of-modal ip-of-modal--detail">
            <div className="ip-of-modal-detail-head">
              <h3 id="ip-of-detail-title">Offer details</h3>
              <button type="button" className="ip-of-icon-btn" onClick={() => setDetailOffer(null)} aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="ip-of-modal-detail-body">{renderOfferCard(liveDetail, { inModal: true })}</div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="ip-of-overlay" role="dialog" aria-modal="true">
          <div className="ip-of-modal">
            <h3>{confirm.action === 'accepted' ? 'Accept internship offer?' : 'Decline internship offer?'}</h3>
            <p>
              You are about to {confirm.action === 'accepted' ? 'accept' : 'decline'} the{' '}
              <strong>{confirm.offer.role_title || confirm.offer.title}</strong> offer from{' '}
              <strong>{confirm.offer.company_name}</strong>.
              {confirm.action === 'accepted'
                ? ' The employer will be notified and onboarding details will show if they were provided.'
                : ' This cannot be undone from here.'}
            </p>
            {error ? <div className="ip-of-alert" style={{ marginTop: '0.75rem' }}>{error}</div> : null}
            <div className="ip-of-modal-actions">
              <button type="button" className="ip-of-btn ip-of-btn--ghost" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={confirm.action === 'accepted' ? 'ip-of-btn ip-of-btn--success' : 'ip-of-btn ip-of-btn--danger'}
                disabled={busyId === confirm.offer.id}
                onClick={() => respond(confirm.offer.id, confirm.action)}
              >
                {confirm.action === 'accepted' ? 'Confirm Acceptance' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareFor ? (
        <div className="ip-of-overlay" role="dialog" aria-modal="true">
          <div className="ip-of-modal">
            <h3>Share offer</h3>
            <p>
              {shareFor.role_title || shareFor.title} — {shareFor.company_name}
            </p>
            <div className="ip-of-modal-actions ip-of-modal-actions--wrap">
              <button type="button" className="ip-of-btn ip-of-btn--ghost" onClick={() => setShareFor(null)}>
                Close
              </button>
              <button type="button" className="ip-of-btn ip-of-btn--outline" onClick={copyShareLink}>
                Copy link
              </button>
              <button type="button" className="ip-of-btn ip-of-btn--outline" onClick={() => shareWhatsApp(shareFor)}>
                <MessageCircle className="size-3.5" />
                WhatsApp
              </button>
              <button type="button" className="ip-of-btn ip-of-btn--primary" onClick={shareLinkedIn}>
                Share on LinkedIn
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rateFor ? (
        <div className="ip-of-overlay" role="dialog" aria-modal="true">
          <div className="ip-of-modal">
            <h3>Rate {rateFor.company_name}</h3>
            <p>Mutual rating after accepted offer</p>
            <div className="ip-of-stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n <= stars ? 'is-on' : 'is-off'}
                  onClick={() => setStars(n)}
                  aria-label={`${n} stars`}
                >
                  ★
                </button>
              ))}
            </div>
            <div className="ip-of-modal-actions">
              <button type="button" className="ip-of-btn ip-of-btn--ghost" onClick={() => setRateFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="ip-of-btn ip-of-btn--primary"
                disabled={busyId === rateFor.id}
                onClick={submitRating}
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
