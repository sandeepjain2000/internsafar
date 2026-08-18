'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Coins,
  Copy,
  Globe,
  Link2,
  Mail,
  MessageCircle,
  Send,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import {
  POINTS_PER_APPLICATION,
  POINTS_PER_POST,
  REFERRAL_POINTS,
} from '@/lib/pointsEconomy';
import '@/components/ip/ip-referral-gemini.css';

const PAGE_SIZE = 10;

function initials(name, email) {
  const n = String(name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || '??';
  }
  const e = String(email || '').trim();
  return (e.slice(0, 2) || '??').toUpperCase();
}

/** Shared Refer & earn panel (candidate + employer) from redesigned mock. */
export default function ReferralCard({ role }) {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState(false);
  const referrals = data?.referrals || [];
  const { page, setPage, totalPages, total, pageItems } = useClientPagination(referrals, PAGE_SIZE);

  const unitCost = role === 'employer' ? POINTS_PER_POST : POINTS_PER_APPLICATION;
  const points = Number(data?.points ?? 0);
  const affordCount = unitCost > 0 ? Math.floor(points / unitCost) : 0;
  const completedCount = useMemo(
    () => referrals.filter((r) => String(r.status).toLowerCase() === 'completed').length,
    [referrals]
  );
  const earnedFromReferrals = useMemo(
    () => referrals.reduce((sum, r) => sum + (Number(r.points_awarded) || 0), 0),
    [referrals]
  );

  useEffect(() => {
    function loadReferral() {
      fetch('/api/ip/referral')
        .then((r) => r.json())
        .then(setData)
        .catch(() => setData(null));
    }
    loadReferral();

    function onFocus() {
      loadReferral();
    }
    window.addEventListener('focus', onFocus);

    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadReferral();
    }, 18000);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
    };
  }, []);

  const link = data?.viralLink || data?.referralLink || '';

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setToast(true);
    setTimeout(() => setCopied(false), 2000);
    setTimeout(() => setToast(false), 3000);
  }

  const liHref = link
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`
    : '#';
  const waHref = link
    ? `https://api.whatsapp.com/send?text=${encodeURIComponent(
        role === 'employer'
          ? `Join PlacementHub Internship Portal with my employer referral link: ${link}`
          : `Hey! Sign up on PlacementHub with my link to find internships: ${link}`
      )}`
    : '#';
  const mailHref = link
    ? `mailto:?subject=${encodeURIComponent('Join PlacementHub')}&body=${encodeURIComponent(
        `Check out PlacementHub: ${link}`
      )}`
    : '#';

  return (
    <div className="ip-refer">
      {toast ? (
        <div className="ip-rf-toast" role="status">
          Referral link copied to clipboard!
        </div>
      ) : null}

      <div className="ip-rf-top">
        <div>
          <div className="ip-rf-pill">
            <Sparkles className="size-3" />
            <span>{role === 'employer' ? 'Employer Rewards Program' : 'Candidate Rewards Program'}</span>
          </div>
          <h1>Refer & Earn Points</h1>
          <p>
            {role === 'employer'
              ? 'Invite other employers to PlacementHub. Earn points automatically to publish internship postings.'
              : 'Invite fellow students to PlacementHub. Earn candidate points automatically to boost your applications.'}
          </p>
        </div>
        <div className="ip-rf-balance">
          <div className="ip-rf-balance__icon">
            <Coins className="size-6" />
          </div>
          <div>
            <div className="ip-rf-balance__label">Your Balance</div>
            <div className="ip-rf-balance__value">{data ? `${points} pts` : '—'}</div>
          </div>
        </div>
      </div>

      <div className="ip-rf-stats">
        <div className="ip-rf-stat">
          <div className="ip-rf-stat__head">
            <span>Available Points</span>
            <Wallet className="size-4 text-indigo-600" />
          </div>
          <div className="ip-rf-stat__value">{data ? points : '—'}</div>
          <p className="ip-rf-stat__sub">
            <span className="ok">Ready to use</span>
          </p>
        </div>
        <div className="ip-rf-stat">
          <div className="ip-rf-stat__head">
            <span>{role === 'employer' ? 'Posting Value' : 'Application Value'}</span>
            <Send className="size-4 text-emerald-600" />
          </div>
          <div className="ip-rf-stat__value">
            {data ? `${affordCount} ${role === 'employer' ? 'Posts' : 'Applications'}` : '—'}
          </div>
          <p className="ip-rf-stat__sub">
            Cost:{' '}
            <strong>
              {unitCost} pts per {role === 'employer' ? 'post' : 'application'}
            </strong>
          </p>
        </div>
        <div className="ip-rf-stat">
          <div className="ip-rf-stat__head">
            <span>Successful Referrals</span>
            <Users className="size-4 text-amber-500" />
          </div>
          <div className="ip-rf-stat__value">
            {data ? `${completedCount} ${role === 'employer' ? 'Employers' : 'Candidates'}` : '—'}
          </div>
          <p className="ip-rf-stat__sub">
            {earnedFromReferrals > 0
              ? `+${earnedFromReferrals} pts earned total`
              : 'Share link to start earning'}
          </p>
        </div>
      </div>

      <div className="ip-rf-card">
        <div className="ip-rf-card__head">
          <h2>
            <Link2 className="size-4 text-indigo-600" />
            Your Unique Referral Link
          </h2>
          <p>
            Share this link to receive reward points upon signup ({REFERRAL_POINTS} pts per successful
            referral).
          </p>
        </div>
        <div className="ip-rf-card__body">
          <div className="ip-rf-link-row">
            <div className="ip-rf-link">
              <span className="ip-rf-link__icon" aria-hidden>
                <Globe className="size-4" />
              </span>
              <input type="text" readOnly value={link || 'Loading…'} aria-label="Referral link" />
            </div>
            <button
              type="button"
              className={`ip-rf-btn${copied ? ' is-copied' : ''}`}
              onClick={copy}
              disabled={!link}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          <div>
            <span className="ip-rf-share-label">Quick Share</span>
            <div className="ip-rf-share">
              <a className="ip-rf-btn--soft" href={liHref} target="_blank" rel="noreferrer">
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: '#0A66C2',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  in
                </span>
                LinkedIn
              </a>
              <a className="ip-rf-btn--soft" href={waHref} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4 text-emerald-600" />
                WhatsApp
              </a>
              <a className="ip-rf-btn--soft" href={mailHref}>
                <Mail className="size-4" />
                Email
              </a>
            </div>
          </div>
        </div>

        <div className="ip-rf-steps">
          <div className="ip-rf-step">
            <div className="ip-rf-step__n">1</div>
            <div>
              <h4>Send Invitation</h4>
              <p>Share your link via WhatsApp, social, or email.</p>
            </div>
          </div>
          <div className="ip-rf-step">
            <div className="ip-rf-step__n">2</div>
            <div>
              <h4>Friend Signs Up</h4>
              <p>
                {role === 'employer'
                  ? 'They create a verified employer account.'
                  : 'They create a verified candidate account.'}
              </p>
            </div>
          </div>
          <div className="ip-rf-step">
            <div className="ip-rf-step__n">3</div>
            <div>
              <h4>Instant +{REFERRAL_POINTS} Points</h4>
              <p>
                {role === 'employer'
                  ? 'Points credited to publish internship postings.'
                  : 'Points credited immediately to apply for internships.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="ip-rf-card">
        <div className="ip-rf-hist-head">
          <div>
            <h2>Referral History</h2>
            <p>Track your successful signups and rewarded points in real-time.</p>
          </div>
          {referrals.length ? (
            <span className="ip-rf-hist-count">Total: {referrals.length} Invites</span>
          ) : null}
        </div>

        {!referrals.length ? (
          <div className="ip-rf-empty">
            <Users className="size-12" strokeWidth={1.5} />
            <p>
              No referrals yet. Share your unique referral link
              {role === 'employer' ? ' with employers' : ' with candidates'} to start earning points!
            </p>
            <button type="button" className="ip-rf-btn--soft" onClick={copy} disabled={!link}>
              <Copy className="size-3.5" />
              Copy Link Now
            </button>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="ip-rf-table">
                <thead>
                  <tr>
                    <th>Referred User</th>
                    <th>Joined Date</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Points Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((r) => {
                    const name = r.referred_name || 'Pending signup';
                    const email = r.referred_email || '';
                    const done = String(r.status).toLowerCase() === 'completed';
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="ip-rf-user">
                            <div className="ip-rf-avatar">{initials(r.referred_name, r.referred_email)}</div>
                            <div>
                              <strong>{name}</strong>
                              {email ? <span>{email}</span> : null}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: '#64748b', fontSize: '0.75rem' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <span className={`ip-rf-badge ${done ? 'ip-rf-badge--ok' : 'ip-rf-badge--pending'}`}>
                            {done ? 'Completed' : r.status || 'Pending'}
                          </span>
                        </td>
                        <td className="ip-rf-pts">+{r.points_awarded ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE ? (
              <div className="ip-rf-pager">
                <span>
                  Page {page} / {totalPages}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
