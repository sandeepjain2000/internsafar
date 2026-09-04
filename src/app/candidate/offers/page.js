'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  Download,
  FileText,
  Inbox,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import '@/components/ip/ip-offers-gemini.css';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';

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
  const [confirm, setConfirm] = useState(null);
  const [shareFor, setShareFor] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayMode, setViewMode, { stored: viewMode, isMobile }] = useViewMode(
    'ip_offers_view',
    'cards',
  );

  const snapshot = useMemo(() => ({ filters: { q, tab }, sort: '' }), [q, tab]);
  const prefs = useListPrefsSync({
    tableKey: 'candidate.offers',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.q != null) setQ(f.q);
      if (f.tab) setTab(f.tab);
    },
  });

  const filterActive = Boolean(q.trim()) || tab !== 'all';

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }

  function resetFilters() {
    setQ('');
    setTab('all');
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
  }, []);

  useEffect(() => {
    if (!isMobile) setFiltersOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    document.body.classList.add('ip-scroll-locked');
    return () => document.body.classList.remove('ip-scroll-locked');
  }, [filtersOpen]);

  const counts = useMemo(() => {
    const c = { all: items.length, action_required: 0, accepted: 0, declined: 0, expired: 0 };
    items.forEach((o) => {
      const t = o.display_tab || 'all';
      if (c[t] != null) c[t] += 1;
    });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((o) => {
      if (tab !== 'all' && o.display_tab !== tab) return false;
      if (!needle) return true;
      const hay = [
        o.role_title,
        o.title,
        o.company_name,
        o.work_mode,
        o.location,
        o.recruiter_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [items, q, tab]);

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

  function messagesHref(o) {
    return o.thread_id
      ? `/candidate/messages?thread=${encodeURIComponent(o.thread_id)}`
      : '/candidate/messages';
  }

  function hasOnboarding(o) {
    return Boolean(o.onboarding_instructions || o.hr_email || o.hr_phone || o.mentor_name);
  }

  function renderTabButton(t) {
    return (
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
    );
  }

  return (
    <div className="ip-offers ip-mobile-bleed">
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
            className={`ip-of-filters-btn${filtersOpen || filterActive ? ' is-on' : ''}`}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Filters
            {filterActive ? <span className="ip-of-filters-chip">1</span> : null}
          </button>
          <button type="button" className="ip-of-reset" onClick={resetFilters}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        </div>
      </div>

      <div className="ip-of-presets-desk">
        <ListPresetsBar {...prefs} />
      </div>

      <div className="ip-of-tabs ip-of-tabs--desk">
        {TABS.map(renderTabButton)}
        <div className="ip-of-view-toggle">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="ip-of-tabstrip" role="tablist" aria-label="Offer status">
        {TABS.map(renderTabButton)}
      </div>

      {filtersOpen ? (
        <>
          <button
            type="button"
            className="ip-of-sheet-scrim"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="ip-of-sheet" role="dialog" aria-label="Filter offers">
            <div className="ip-of-sheet__handle" aria-hidden />
            <div className="ip-of-sheet__head">
              <h3>Filters</h3>
              <button
                type="button"
                className="ip-of-sheet__x"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="ip-of-sheet__body">
              <p className="ip-of-sheet__hint">Status</p>
              {TABS.map((t) => (
                <button
                  key={`sheet-${t.id}`}
                  type="button"
                  className={tab === t.id ? 'is-on' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.dot ? <span className={`ip-of-dot ip-of-dot--${t.dot}`} aria-hidden /> : null}
                  <span>{t.label}</span>
                  <span className="ip-of-count">{counts[t.id] || 0}</span>
                </button>
              ))}
              <div className="ip-of-sheet__presets">
                <ListPresetsBar {...prefs} />
              </div>
            </div>
            <div className="ip-of-sheet__actions">
              <button type="button" className="ip-of-btn ip-of-btn--outline" onClick={resetFilters}>
                Reset
              </button>
              <button
                type="button"
                className="ip-of-btn ip-of-btn--primary"
                onClick={() => setFiltersOpen(false)}
              >
                Show {filtered.length}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {error ? <div className="ip-of-alert ip-mobile-inset">{error}</div> : null}

      {!loading && !filtered.length ? (
        <div className="ip-of-empty ip-mobile-inset">
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

      <div className={displayMode === 'list' ? 'ip-ph-list-wrap' : 'ip-of-list'}>
        {displayMode === 'list' ? (
          <table className="ip-ph-list">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">Role</th>
                <th className="p-3">Employer</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b">
                  <td className="p-3">{o.role_title || o.title}</td>
                  <td className="p-3">{o.company_name}</td>
                  <td className="p-3">{o.display_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.map((o) => {          const pending = o.display_status === 'action_required';
          const accepted = o.display_status === 'accepted';
          const role = o.role_title || o.title || 'Internship offer';
          return (
            <article key={o.id} className="ip-of-card">
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
                    <h3>{role}</h3>
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
                    <p>{o.message ? `“${o.message}”` : 'No recruiter note was attached to this offer.'}</p>
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
        })}
      </div>

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
            <div className="ip-of-modal-actions">
              <button type="button" className="ip-of-btn ip-of-btn--ghost" onClick={() => setShareFor(null)}>
                Close
              </button>
              <button type="button" className="ip-of-btn ip-of-btn--outline" onClick={copyShareLink}>
                Copy link
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
