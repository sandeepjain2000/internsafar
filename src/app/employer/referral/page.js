'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  Gift,
  Info,
  Link2,
  Mail,
  MailPlus,
  MessageCircle,
  Search,
  Send,
  Share2,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import { POINTS_PER_POST, REFERRAL_POINTS } from '@/lib/pointsEconomy';
import '@/components/ip/ip-employer-referral-gemini.css';

const PAGE_SIZE = 10;
const FILTERS = ['All', 'Verified', 'Pending'];

function orgLabel(r) {
  return r.referred_company || r.referred_name || 'Pending signup';
}

function domainLabel(r) {
  return r.referred_domain || (r.referred_email ? String(r.referred_email).split('@')[1] : '') || '—';
}

function initials(r) {
  const label = orgLabel(r);
  const parts = String(label)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function isVerified(r) {
  return String(r.status || '').toLowerCase() === 'completed';
}

export default function EmployerReferralPage() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const referrals = data?.referrals || [];
  const points = Number(data?.points ?? 0);
  const affordPosts = POINTS_PER_POST > 0 ? Math.floor(points / POINTS_PER_POST) : 0;

  useEffect(() => {
    fetch('/api/ip/referral')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const link = data?.viralLink || data?.referralLink || '';

  const completed = useMemo(() => referrals.filter(isVerified), [referrals]);
  const earnedFromReferrals = useMemo(
    () => referrals.reduce((sum, r) => sum + (Number(r.points_awarded) || 0), 0),
    [referrals],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return referrals.filter((r) => {
      const verified = isVerified(r);
      if (filter === 'Verified' && !verified) return false;
      if (filter === 'Pending' && verified) return false;
      if (!needle) return true;
      const hay = `${orgLabel(r)} ${domainLabel(r)} ${r.referred_email || ''} ${r.referred_name || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [referrals, q, filter]);

  const { page, setPage, totalPages, total, pageItems } = useClientPagination(filtered, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filter, setPage]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  }

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    showToast('Referral link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  const liHref = link
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`
    : '#';
  const waHref = link
    ? `https://api.whatsapp.com/send?text=${encodeURIComponent(
        `Join PlacementHub to post internships and hire verified talent: ${link}`,
      )}`
    : '#';

  function openInviteMail(e) {
    e?.preventDefault?.();
    const to = inviteEmail.trim();
    if (!to || !link) return;
    const subject = encodeURIComponent('Join PlacementHub as an employer');
    const body = encodeURIComponent(
      `Hi,\n\nYou're invited to join PlacementHub Internship Portal as an employer.\nUse this link to register (referral tracked):\n${link}\n\nThanks!`,
    );
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
    setShowInvite(false);
    setInviteEmail('');
    showToast(`Opening your email app to invite ${to}`);
  }

  return (
    <div className="ip-emp-ref">
      {toast ? (
        <div className="ip-er-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-er-toolbar">
        <div className="ip-er-crumb">
          <span>Employer Workspace</span>
          <ChevronRight size={14} aria-hidden />
          <strong>Refer & Earn Points</strong>
        </div>
        <div className="ip-er-toolbar-actions">
          <div className="ip-er-pts-pill">
            <span className="ip-er-pts-pill__dot" aria-hidden>
              <Coins size={12} />
            </span>
            <span>{data ? `${points} Reward Points` : '— Reward Points'}</span>
          </div>
          <button type="button" className="ip-er-btn-primary" onClick={() => setShowInvite(true)} disabled={!link}>
            <MailPlus size={15} aria-hidden />
            Email Invite
          </button>
        </div>
      </div>

      <div className="ip-er-hero">
        <div>
          <div className="ip-er-hero__pill">
            <Gift size={14} aria-hidden />
            <span>Employer Rewards Program</span>
          </div>
          <h1>Refer Employers & Publish Postings Free</h1>
          <p>
            Invite fellow companies and HR recruiters to PlacementHub. Automatically earn{' '}
            <strong>{REFERRAL_POINTS} points</strong> per verified signup to publish internship listings
            without fees.
          </p>
        </div>
        <div className="ip-er-hero-balance">
          <span>Current Balance</span>
          <div className="ip-er-hero-balance__val">
            <Sparkles size={22} aria-hidden />
            <span>{data ? `${points} PTS` : '—'}</span>
          </div>
          <em>
            {data
              ? affordPosts > 0
                ? `${affordPosts} Free Internship Posting${affordPosts === 1 ? '' : 's'} Ready`
                : `Need ${POINTS_PER_POST} pts per posting`
              : 'Loading…'}
          </em>
        </div>
      </div>

      <div className="ip-er-metrics">
        <div className="ip-er-metric">
          <div>
            <p>Available Points</p>
            <h3>{data ? `${points} Points` : '—'}</h3>
            <div className="ip-er-metric-sub ip-er-metric-sub--ok">
              <CheckCircle2 size={13} aria-hidden />
              <span>Ready for instant use</span>
            </div>
          </div>
          <div className="ip-er-metric-icon ip-er-metric-icon--brand">
            <Wallet size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-er-metric">
          <div>
            <p>Posting Value</p>
            <h3>
              {data ? `${affordPosts} Posting${affordPosts === 1 ? '' : 's'}` : '—'}
            </h3>
            <div className="ip-er-metric-sub ip-er-metric-sub--muted">
              <Info size={13} aria-hidden />
              <span>Cost: {POINTS_PER_POST} pts per post</span>
            </div>
          </div>
          <div className="ip-er-metric-icon ip-er-metric-icon--ok">
            <Send size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-er-metric">
          <div>
            <p>Successful Referrals</p>
            <h3>
              {data ? `${completed.length} Employer${completed.length === 1 ? '' : 's'}` : '—'}
            </h3>
            <div className="ip-er-metric-sub ip-er-metric-sub--brand">
              <Users size={13} aria-hidden />
              <span>
                {earnedFromReferrals > 0
                  ? `+${earnedFromReferrals} points earned total`
                  : 'Share link to start earning'}
              </span>
            </div>
          </div>
          <div className="ip-er-metric-icon ip-er-metric-icon--warn">
            <UserPlus size={22} aria-hidden />
          </div>
        </div>
      </div>

      <div className="ip-er-card">
        <h3>Your Unique Referral Link</h3>
        <p className="ip-er-card__intro">
          Share this URL to receive reward points automatically upon company sign up (
          {REFERRAL_POINTS} pts per verified referral).
        </p>

        <div className="ip-er-link-row">
          <div className="ip-er-link">
            <Link2 size={16} aria-hidden />
            <input type="text" readOnly value={link || 'Loading…'} aria-label="Referral link" />
          </div>
          <button type="button" className="ip-er-btn-primary" onClick={copy} disabled={!link}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <div className="ip-er-share-row">
          <span className="ip-er-share-label">Quick Share to Network:</span>
          <div className="ip-er-share">
            <a
              className="ip-er-share--li"
              href={liHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => link && showToast('Opening LinkedIn share…')}
            >
              <Share2 size={14} aria-hidden />
              LinkedIn
            </a>
            <a
              className="ip-er-share--wa"
              href={waHref}
              target="_blank"
              rel="noreferrer"
              onClick={() => link && showToast('Opening WhatsApp…')}
            >
              <MessageCircle size={14} aria-hidden />
              WhatsApp
            </a>
            <button type="button" className="ip-er-share--mail" onClick={() => setShowInvite(true)} disabled={!link}>
              <Mail size={14} aria-hidden />
              Direct Email
            </button>
          </div>
        </div>

        <p className="ip-er-steps-label">How Referral Rewards Work</p>
        <div className="ip-er-steps">
          <div className="ip-er-step">
            <div className="ip-er-step__head">
              <div className="ip-er-step__n">1</div>
              <h4>Send Invitation</h4>
            </div>
            <p>Share your custom referral link via WhatsApp, LinkedIn, email, or direct messages.</p>
          </div>
          <div className="ip-er-step">
            <div className="ip-er-step__head">
              <div className="ip-er-step__n">2</div>
              <h4>Employer Signs Up</h4>
            </div>
            <p>They create a verified employer account using your referral link.</p>
          </div>
          <div className="ip-er-step">
            <div className="ip-er-step__head">
              <div className="ip-er-step__n">3</div>
              <h4>Instant +{REFERRAL_POINTS} Points</h4>
            </div>
            <p>{REFERRAL_POINTS} points automatically credited to publish internship listings fee-free.</p>
          </div>
        </div>
      </div>

      <div className="ip-er-card">
        <div className="ip-er-hist-head">
          <div>
            <h2>Referral History</h2>
            <p className="ip-er-card__intro">Track your invited organizations and credited reward points in real time.</p>
          </div>
          {referrals.length ? (
            <span className="ip-er-hist-count">Total: {referrals.length} Invites</span>
          ) : null}
        </div>

        {referrals.length ? (
          <div className="ip-er-filters">
            <div className="ip-er-search">
              <Search size={14} aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search organization or domain…"
                aria-label="Search referrals"
              />
            </div>
            <div className="ip-er-tabs" role="tablist" aria-label="Referral status">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  className={`ip-er-tab${filter === f ? ' ip-er-tab--on' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!referrals.length ? (
          <div className="ip-er-empty">
            <div className="ip-er-empty__icon">
              <Users size={22} aria-hidden />
            </div>
            <p>
              <strong>No employer referrals yet</strong>
              Share your unique referral link with fellow HR managers and recruiters to start earning free
              posting points!
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" className="ip-er-btn-primary" onClick={copy} disabled={!link}>
                <Copy size={14} aria-hidden />
                Copy Link Now
              </button>
            </div>
          </div>
        ) : !filtered.length ? (
          <div className="ip-er-empty">
            <p>
              <strong>No matches</strong>
              Try another search or status filter.
            </p>
          </div>
        ) : (
          <>
            <div className="ip-er-table-wrap">
              <table className="ip-er-table">
                <thead>
                  <tr>
                    <th>Organization Name</th>
                    <th>Domain</th>
                    <th>Date Joined</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Points Rewarded</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => {
                    const verified = isVerified(r);
                    const pts = Number(r.points_awarded) || 0;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="ip-er-org">
                            <div className="ip-er-avatar" aria-hidden>
                              {initials(r)}
                            </div>
                            <div>
                              <strong>{orgLabel(r)}</strong>
                              {r.referred_email ? <span>{r.referred_email}</span> : null}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#64748b' }}>{domainLabel(r)}</td>
                        <td style={{ color: '#64748b' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <span className={`ip-er-badge ${verified ? 'ip-er-badge--ok' : 'ip-er-badge--pending'}`}>
                            {verified ? 'Verified' : r.status || 'Pending'}
                          </span>
                        </td>
                        <td className="ip-er-pts">
                          {verified
                            ? `+${pts || REFERRAL_POINTS} Pts`
                            : pts
                              ? `+${pts} Pts (Pending)`
                              : `+${REFERRAL_POINTS} Pts (Pending)`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="ip-er-pager">
                <button type="button" className="ip-er-btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Prev
                </button>
                <span>
                  {page} / {totalPages} · {total} shown
                </span>
                <button
                  type="button"
                  className="ip-er-btn-ghost"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {showInvite ? (
        <div className="ip-er-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-er-invite-title">
          <form className="ip-er-modal" onSubmit={openInviteMail}>
            <div className="ip-er-modal__head">
              <div className="ip-er-modal__icon">
                <MailPlus size={18} aria-hidden />
              </div>
              <div>
                <h2 id="ip-er-invite-title">Email Invite</h2>
              </div>
            </div>
            <label htmlFor="ip-er-invite-email">Recruiter / company email</label>
            <input
              id="ip-er-invite-email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="hr@company.com"
              autoFocus
            />
            <p className="ip-er-modal__hint">
              Opens your email app with your live referral link prefilled. You earn{' '}
              <strong>{REFERRAL_POINTS} reward points</strong> when they register as an employer via that
              link.
            </p>
            <div className="ip-er-modal-actions">
              <button type="button" className="ip-er-btn-ghost" onClick={() => setShowInvite(false)}>
                Cancel
              </button>
              <button type="submit" className="ip-er-btn-primary" disabled={!link || !inviteEmail.trim()}>
                Open email
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
