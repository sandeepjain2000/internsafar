'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  FileText,
  Globe,
  History,
  Info,
  Link as LinkIcon,
  Lock,
  Mail,
  MessageCircle,
  Receipt,
  Send,
  Share2,
  ShieldAlert,
  ShieldX,
  Sparkles,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  FIRST_APPLICATION_BONUS,
  POINTS_PER_APPLICATION,
  PROFILE_COMPLETE_POINTS,
  REFERRAL_POINTS,
} from '@/lib/pointsEconomy';
import '@/components/ip/ip-candidate-referral-gemini.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'credited', label: 'Credited' },
  { id: 'awaiting', label: 'Awaiting Verification' },
  { id: 'invalid', label: 'Invalid' },
];

function inviteBody(link) {
  return `Hi! I'm using PlacementHub Internship Portal to apply for internships.

Sign up using my invite link to create your candidate profile and start applying:

${link}

(Note: I receive +${REFERRAL_POINTS} application points after you register. Gmail signups credit immediately; form signups credit after SuperAdmin approval.)`;
}

function LinkedinMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.73V1.73C24 .77 23.21 0 22.23 0z" />
    </svg>
  );
}

function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function badgeFor(filterKey) {
  if (filterKey === 'credited') return { cls: 'ip-cr-badge--ok', Icon: CheckCircle2 };
  if (filterKey === 'awaiting') return { cls: 'ip-cr-badge--wait', Icon: Clock };
  return { cls: 'ip-cr-badge--bad', Icon: XCircle };
}

function pointsCell(row) {
  if (row.filter_key === 'credited') {
    return { cls: 'ip-cr-pts-cell--ok', text: `+${row.points_awarded || REFERRAL_POINTS} pts` };
  }
  if (row.filter_key === 'awaiting') {
    return { cls: 'ip-cr-pts-cell--wait', text: 'Pending' };
  }
  return { cls: 'ip-cr-pts-cell--muted', text: '0 pts' };
}

export default function CandidateReferralPage() {
  const [data, setData] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerBalance, setLedgerBalance] = useState(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  }

  async function load() {
    const [refRes, ledRes] = await Promise.all([
      fetch('/api/ip/referral'),
      fetch('/api/ip/points/ledger'),
    ]);
    const refJson = await refRes.json().catch(() => null);
    const ledJson = await ledRes.json().catch(() => null);
    setData(refJson);
    setLedger(ledJson?.items || []);
    setLedgerBalance(ledJson?.balance ?? refJson?.points ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  const referrals = data?.referrals || [];
  const points = Number(data?.points ?? 0);
  const afford = POINTS_PER_APPLICATION > 0 ? Math.floor(points / POINTS_PER_APPLICATION) : 0;
  const link = data?.viralLink || data?.referralLink || '';
  const earned = data?.waysEarned || {};

  const counts = useMemo(() => {
    const c = { all: referrals.length, credited: 0, awaiting: 0, invalid: 0 };
    referrals.forEach((r) => {
      const key = r.filter_key || 'awaiting';
      if (c[key] != null) c[key] += 1;
    });
    return c;
  }, [referrals]);

  const credited = useMemo(
    () => referrals.filter((r) => r.filter_key === 'credited'),
    [referrals],
  );
  const earnedFromReferrals = useMemo(
    () => credited.reduce((sum, r) => sum + (Number(r.points_awarded) || 0), 0),
    [credited],
  );

  const filtered = useMemo(() => {
    if (filter === 'all') return referrals;
    return referrals.filter((r) => r.filter_key === filter);
  }, [referrals, filter]);

  function copyLink() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    showToast('Referral link copied to clipboard!');
    window.setTimeout(() => setCopied(false), 2000);
  }

  function copyInvite() {
    if (!link) return;
    navigator.clipboard?.writeText(inviteBody(link));
    setModal(null);
    showToast('Invite message copied to clipboard!');
  }

  const waHref = link
    ? `https://wa.me/?text=${encodeURIComponent(inviteBody(link))}`
    : '#';
  const liHref = link
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`
    : '#';
  const mailHref = link
    ? `mailto:?subject=${encodeURIComponent('Join PlacementHub Internships')}&body=${encodeURIComponent(inviteBody(link))}`
    : '#';

  return (
    <div className="ip-cand-ref">
      {toast ? (
        <div className="ip-cr-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-cr-header">
        <div>
          <div className="ip-cr-pills">
            <span className="ip-cr-pill">Candidate Rewards Program</span>
          </div>
          <h1>Refer & Earn Points</h1>
          <p>
            Refer eligible candidates to earn points. Points unlock additional internship applications
            ({POINTS_PER_APPLICATION} pts / app).
          </p>
        </div>
        <button type="button" className="ip-cr-btn" onClick={() => setModal('rules')}>
          <ShieldAlert aria-hidden />
          Program Rules & Terms
        </button>
      </div>

      <div className="ip-cr-metrics">
        <div className="ip-cr-metric">
          <div className="ip-cr-metric__top">
            <span>Available Points</span>
            <div className="ip-cr-metric__icon">
              <Wallet size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cr-metric__val">
            <strong>{data ? points : '—'}</strong>
            {data ? <span className="ip-cr-chip ip-cr-chip--ok">Ready to use</span> : null}
          </div>
          <p>
            <Info aria-hidden />
            Spent directly when submitting applications ({POINTS_PER_APPLICATION} pts / app).
          </p>
        </div>
        <div className="ip-cr-metric">
          <div className="ip-cr-metric__top">
            <span>Application Value</span>
            <div className="ip-cr-metric__icon">
              <Send size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cr-metric__val">
            <strong>
              {data ? `${afford} Application${afford === 1 ? '' : 's'}` : '—'}
            </strong>
          </div>
          <p>
            Standard cost: <strong>{POINTS_PER_APPLICATION} points per application</strong>. No cash
            conversion.
          </p>
        </div>
        <div className="ip-cr-metric">
          <div className="ip-cr-metric__top">
            <span>Reward Verified Referrals</span>
            <div className="ip-cr-metric__icon ip-cr-metric__icon--warn">
              <Users size={16} aria-hidden />
            </div>
          </div>
          <div className="ip-cr-metric__val">
            <strong>
              {data
                ? `${credited.length} Candidate${credited.length === 1 ? '' : 's'}`
                : '—'}
            </strong>
            {earnedFromReferrals > 0 ? (
              <span className="ip-cr-chip ip-cr-chip--brand">+{earnedFromReferrals} pts earned total</span>
            ) : null}
          </div>
          <p>
            Earns <strong>{REFERRAL_POINTS} points</strong> per candidate who registers and verifies.
          </p>
        </div>
      </div>

      <div className="ip-cr-card">
        <div className="ip-cr-card__head">
          <div>
            <h2>
              <LinkIcon aria-hidden />
              Your Unique Referral Link
            </h2>
            <p>
              Share this link with eligible candidates. Gmail signups credit immediately. Form
              signups credit after SuperAdmin approval.
            </p>
          </div>
          <span className="ip-cr-chip ip-cr-chip--brand">
            Earn +{REFERRAL_POINTS} pts per verified candidate
          </span>
        </div>

        <label className="ip-cr-label" htmlFor="ip-cr-link">
          Personal Invite Link
        </label>
        <div className="ip-cr-link-row">
          <div className="ip-cr-link">
            <Globe aria-hidden />
            <input
              id="ip-cr-link"
              type="text"
              readOnly
              value={link || 'Loading…'}
              aria-label="Referral link"
            />
          </div>
          <button type="button" className="ip-cr-btn ip-cr-btn--primary" onClick={copyLink} disabled={!link}>
            <Copy aria-hidden />
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        <p className="ip-cr-hint">
          Privacy protected: the link contains your referral code only. Referred people are masked
          in your history.
        </p>

        <label className="ip-cr-label">Quick Share Options</label>
        <div className="ip-cr-share">
          <a className="ip-cr-share--wa" href={waHref} target="_blank" rel="noreferrer">
            <MessageCircle size={16} aria-hidden />
            Share on WhatsApp
          </a>
          <a className="ip-cr-share--li" href={liHref} target="_blank" rel="noreferrer">
            <LinkedinMark />
            Share on LinkedIn
          </a>
          <a className="ip-cr-share--mail" href={mailHref}>
            <Mail size={16} aria-hidden />
            Share via Email
          </a>
          <button type="button" className="ip-cr-share--preview" onClick={() => setModal('invite')} disabled={!link}>
            <Share2 size={16} aria-hidden />
            Preview Invite Message
          </button>
        </div>
      </div>

      <div className="ip-cr-split">
        <div className="ip-cr-card">
          <div className="ip-cr-card__head">
            <h2>
              <History aria-hidden />
              How Referrals Work
            </h2>
            <span className="ip-cr-muted">4-step qualification</span>
          </div>
          <div className="ip-cr-steps">
            <div className="ip-cr-step">
              <div className="ip-cr-step__n">1</div>
              <div>
                <h3>Share Invite Link</h3>
                <p>Send your unique link via WhatsApp, LinkedIn, or email.</p>
              </div>
              <em>Step 1</em>
            </div>
            <div className="ip-cr-step">
              <div className="ip-cr-step__n">2</div>
              <div>
                <h3>Candidate Registers</h3>
                <p>They create an account using your link.</p>
              </div>
              <em>Step 2</em>
            </div>
            <div className="ip-cr-step">
              <div className="ip-cr-step__n ip-cr-step__n--warn">3</div>
              <div>
                <h3>Verification</h3>
                <p>
                  Gmail registration verifies immediately. Form registration waits for SuperAdmin
                  approval.
                </p>
              </div>
              <em>Required check</em>
            </div>
            <div className="ip-cr-step ip-cr-step--credit">
              <div className="ip-cr-step__n ip-cr-step__n--ok">4</div>
              <div>
                <h3>+{REFERRAL_POINTS} Points Credited</h3>
                <p>Reward is added to your points balance.</p>
              </div>
              <em>Points credited</em>
            </div>
          </div>
          <div className="ip-cr-note">
            <AlertCircle aria-hidden />
            <span>
              <strong>Important:</strong> Opening or sharing the link does not credit points. Form
              registrations stay in Awaiting Verification until SuperAdmin approval. Gmail
              registrations credit when signup finishes.
            </span>
          </div>
        </div>

        <div className="ip-cr-card">
          <div className="ip-cr-card__head">
            <h2>
              <Sparkles aria-hidden />
              Ways to Earn Points
            </h2>
            <span className="ip-cr-muted">Platform rewards</span>
          </div>
          <div className="ip-cr-earn">
            <div className="ip-cr-earn-row">
              <div>
                <strong>Refer eligible candidates</strong>
                <span>Earn when the candidate verifies their account</span>
              </div>
              <span className="ip-cr-pts ip-cr-pts--ok">+{REFERRAL_POINTS} pts</span>
            </div>
            <div className="ip-cr-earn-row">
              <div>
                <strong>Complete candidate profile</strong>
                <span>Add resume, skills, and education details</span>
              </div>
              <span className={`ip-cr-pts${earned.profileComplete ? ' ip-cr-pts--ok' : ''}`}>
                {earned.profileComplete ? 'Earned' : `+${PROFILE_COMPLETE_POINTS} pts`}
              </span>
            </div>
            <div className="ip-cr-earn-row">
              <div>
                <strong>First application bonus</strong>
                <span>Awarded when you submit your first application</span>
              </div>
              <span className={`ip-cr-pts${earned.firstApplication ? ' ip-cr-pts--ok' : ''}`}>
                {earned.firstApplication ? 'Earned' : `+${FIRST_APPLICATION_BONUS} pts`}
              </span>
            </div>
          </div>
          <p className="ip-cr-muted" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
            Referrals are optional. Applying still costs {POINTS_PER_APPLICATION} points each time.
          </p>
        </div>
      </div>

      <div className="ip-cr-card ip-cr-hist">
        <div className="ip-cr-card__head">
          <div>
            <h2>
              <History aria-hidden />
              Referral History
            </h2>
            <p>Track referred candidates, verification progress, and reward status.</p>
          </div>
          <div className="ip-cr-tabs" role="tablist" aria-label="Referral status">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                className={filter === f.id ? 'is-on' : ''}
                onClick={() => setFilter(f.id)}
              >
                {f.label} ({counts[f.id] || 0})
              </button>
            ))}
          </div>
        </div>

        {!referrals.length ? (
          <div className="ip-cr-empty">
            <div className="ip-cr-empty__icon">
              <Users size={22} aria-hidden />
            </div>
            <p>No referrals yet</p>
            <span>Share your unique referral link with candidates to start earning points.</span>
            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" className="ip-cr-btn ip-cr-btn--primary" onClick={copyLink} disabled={!link}>
                <Copy aria-hidden />
                Copy Link Now
              </button>
            </div>
          </div>
        ) : !filtered.length ? (
          <div className="ip-cr-empty">
            <div className="ip-cr-empty__icon">
              <Users size={22} aria-hidden />
            </div>
            <p>No referrals found</p>
            <span>There are no referrals matching this status filter.</span>
          </div>
        ) : (
          <div className="ip-cr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Referred Candidate</th>
                  <th>Invite Date</th>
                  <th>Referral Status</th>
                  <th>Status Details / Reason</th>
                  <th style={{ textAlign: 'right' }}>Points Reward</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const badge = badgeFor(r.filter_key);
                  const pts = pointsCell(r);
                  const Icon = badge.Icon;
                  return (
                    <tr key={r.id}>
                      <td className="ip-cr-name">{r.display_label}</td>
                      <td className="ip-cr-mono">{fmtDate(r.created_at)}</td>
                      <td>
                        <span className={`ip-cr-badge ${badge.cls}`}>
                          <Icon aria-hidden />
                          {r.status_label}
                        </span>
                      </td>
                      <td>{r.status_detail}</td>
                      <td className={`ip-cr-right ${pts.cls}`}>{pts.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="ip-cr-foot">
          <div>
            <Lock aria-hidden />
            <span>Privacy notice: candidate identity is masked.</span>
          </div>
          <span>
            Total referral rewards:{' '}
            <strong style={{ color: '#0f172a' }}>+{earnedFromReferrals} Points</strong>
          </span>
        </div>
      </div>

      <div className="ip-cr-card" id="points-ledger-section">
        <div className="ip-cr-card__head">
          <div>
            <h2>
              <Receipt aria-hidden />
              Points Transaction History
            </h2>
            <p>Complete ledger of points earned, spent on applications, and resulting balances.</p>
          </div>
          <div className="ip-cr-ledger-meta">
            Current available balance:{' '}
            <strong>{ledgerBalance == null ? '—' : `${ledgerBalance} Pts`}</strong>
          </div>
        </div>

        {!ledger.length ? (
          <div className="ip-cr-empty">
            <div className="ip-cr-empty__icon">
              <Coins size={22} aria-hidden />
            </div>
            <p>No ledger rows yet</p>
            <span>Signup, referrals, profile completion, and applications appear here.</span>
          </div>
        ) : (
          <div className="ip-cr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction Details / Reason</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'center' }}>Points Impact</th>
                  <th style={{ textAlign: 'right' }}>Balance After</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => {
                  const pos = row.delta >= 0;
                  return (
                    <tr key={row.id}>
                      <td className="ip-cr-mono">{fmtDate(row.created_at)}</td>
                      <td>
                        <div className="ip-cr-name">{row.title}</div>
                        {row.subtitle ? <div className="ip-cr-muted">{row.subtitle}</div> : null}
                      </td>
                      <td>
                        <span className={`ip-cr-cat ip-cr-cat--${row.categoryKey || 'other'}`}>
                          {row.category}
                        </span>
                      </td>
                      <td className={`ip-cr-impact ${pos ? 'ip-cr-impact--pos' : 'ip-cr-impact--neg'}`}>
                        {pos ? '+' : ''}
                        {row.delta} pts
                      </td>
                      <td className="ip-cr-right">{row.balance_after} pts</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="ip-cr-card">
        <h2>
          <FileText aria-hidden />
          Referral Program Guidelines & Eligibility Rules
        </h2>
        <div className="ip-cr-rules" style={{ marginTop: '1rem' }}>
          <div className="ip-cr-rule">
            <h3>
              <CheckCircle2 color="#059669" aria-hidden />
              Verification requirement
            </h3>
            <p>
              Points credit after the referred candidate registers with your link and their account
              is verified. Gmail signups verify on registration. Form signups stay in Awaiting
              Verification until SuperAdmin approval.
            </p>
          </div>
          <div className="ip-cr-rule">
            <h3>
              <ShieldX color="#f43f5e" aria-hidden />
              Self-referral prevention
            </h3>
            <p>
              You cannot refer an email that already has an account, including your own. Those
              attempts are stored as Invalid and earn zero points. We do not use device fingerprints
              or identity documents.
            </p>
          </div>
          <div className="ip-cr-rule">
            <h3>
              <Copy color="#d97706" aria-hidden />
              Duplicate referral handling
            </h3>
            <p>
              If someone already has an account, later links do not earn a second reward. Credit
              belongs to the link used at first successful account creation.
            </p>
          </div>
          <div className="ip-cr-rule">
            <h3>
              <Coins color="#4f46e5" aria-hidden />
              Non-monetary application points
            </h3>
            <p>
              Points have no cash value and cannot be transferred or withdrawn. They only unlock
              internship applications ({POINTS_PER_APPLICATION} pts / app).
            </p>
          </div>
        </div>
      </div>

      {modal === 'invite' ? (
        <div className="ip-cr-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-cr-invite-title">
          <div className="ip-cr-modal">
            <div className="ip-cr-modal__head">
              <h3 id="ip-cr-invite-title">
                <Share2 aria-hidden />
                Preview Invitation Message
              </h3>
              <button type="button" className="ip-cr-modal__x" onClick={() => setModal(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="ip-cr-modal__body">
              <p>This is the message used when sharing your referral link:</p>
              <div className="ip-cr-preview">
                <p>Hi! I&apos;m using PlacementHub Internship Portal to apply for internships.</p>
                <p>Sign up using my invite link to create your candidate profile and start applying:</p>
                <div className="ip-cr-preview-link">{link}</div>
                <p style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: '0.6875rem' }}>
                  (Note: I receive +{REFERRAL_POINTS} application points after you register. Gmail
                  signups credit immediately; form signups credit after SuperAdmin approval.)
                </p>
              </div>
            </div>
            <div className="ip-cr-modal__foot">
              <button type="button" className="ip-cr-btn" onClick={() => setModal(null)}>
                Close
              </button>
              <button type="button" className="ip-cr-btn ip-cr-btn--primary" onClick={copyInvite}>
                <Copy aria-hidden />
                Copy Full Message
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === 'rules' ? (
        <div className="ip-cr-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-cr-rules-title">
          <div className="ip-cr-modal">
            <div className="ip-cr-modal__head">
              <h3 id="ip-cr-rules-title">
                <ShieldAlert aria-hidden />
                PlacementHub Referral Terms
              </h3>
              <button type="button" className="ip-cr-modal__x" onClick={() => setModal(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <div className="ip-cr-modal__body">
              <p>
                <strong>1. Qualifying event:</strong> Points credit after the referred candidate
                registers via your unique link and their account is verified (Gmail signup, or
                SuperAdmin approval for form registration).
              </p>
              <p>
                <strong>2. Point credit value:</strong> Referrers receive {REFERRAL_POINTS} points per
                verified candidate. Points have no monetary value and are non-transferable.
              </p>
              <p>
                <strong>3. Application conversion:</strong> Points redeem at{' '}
                {POINTS_PER_APPLICATION} points per internship application.
              </p>
              <p>
                <strong>4. Self-referrals:</strong> Referring an email that already has an account,
                including your own, earns zero points and is marked Invalid.
              </p>
              <p>
                <strong>5. Duplicate referrals:</strong> Credit is attributed to the link used at
                account creation. Later claims for the same user are marked Duplicate.
              </p>
              <p>
                <strong>6. Privacy:</strong> Referral history shows a masked candidate number and
                first name initial only — not email addresses.
              </p>
            </div>
            <div className="ip-cr-modal__foot">
              <button type="button" className="ip-cr-btn ip-cr-btn--primary" onClick={() => setModal(null)}>
                I Understand
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
