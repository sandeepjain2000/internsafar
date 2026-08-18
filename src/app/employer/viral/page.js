'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  Gift,
  Link2,
  MessageCircle,
  PlusCircle,
  Search,
  Share2,
  Sparkles,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useClientPagination } from '@/hooks/useClientPagination';
import { LINKEDIN_PROMO_POINTS, POINTS_PER_POST } from '@/lib/pointsEconomy';
import '@/components/ip/ip-employer-viral-gemini.css';

const PAGE_SIZE = 10;
const FILTERS = ['All', 'Verified', 'Pending'];

function channelLabel(channel) {
  const c = String(channel || '').toLowerCase();
  if (c === 'linkedin') return 'LinkedIn';
  if (c === 'whatsapp') return 'WhatsApp';
  if (c === 'twitter') return 'Twitter';
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other';
}

function isVerifiedShare(s) {
  const st = String(s.status || '').toLowerCase();
  return st === 'rewarded' || st === 'verified';
}

function isPendingShare(s) {
  const st = String(s.status || '').toLowerCase();
  return ['fast_track_pending', 'scheduled', 'pending', 'searching'].includes(st);
}

function statusLabel(s) {
  const st = String(s.status || '').toLowerCase();
  if (isVerifiedShare(s)) return 'Verified';
  if (st === 'failed') return 'Failed';
  if (isPendingShare(s)) return 'Pending Verification';
  return s.status || 'Pending';
}

function badgeClass(s) {
  const st = String(s.status || '').toLowerCase();
  if (isVerifiedShare(s)) return 'ip-ev-badge--ok';
  if (st === 'failed') return 'ip-ev-badge--fail';
  return 'ip-ev-badge--pending';
}

function postReference(s) {
  return s.claimed_post_url || s.share_url || '—';
}

function nextCheckLabel(s) {
  if (isVerifiedShare(s)) return 'Completed';
  if (String(s.status || '').toLowerCase() === 'failed') return '—';
  if (s.check_after) {
    const target = new Date(s.check_after).getTime();
    const diff = target - Date.now();
    if (diff > 0) {
      const hrs = Math.ceil(diff / (60 * 60 * 1000));
      if (hrs <= 48) return `In ~${hrs} hour${hrs === 1 ? '' : 's'}`;
      return new Date(s.check_after).toLocaleString();
    }
  }
  return 'Scheduled';
}

function pointsLabel(s, rewardPts) {
  const awarded = Number(s.points_awarded) || 0;
  if (awarded > 0) return `+${awarded} Pts`;
  if (isVerifiedShare(s)) return `+${rewardPts} Pts`;
  if (isPendingShare(s)) return `+${rewardPts} Pts (Pending)`;
  return '—';
}

export default function EmployerViralPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [submitModal, setSubmitModal] = useState(false);
  const [submitTargetId, setSubmitTargetId] = useState(null);
  const [postUrlInput, setPostUrlInput] = useState('');

  const shareItems = data?.items || [];
  const points = Number(data?.points ?? 0);
  const rewardPts = Number(data?.rewardPreview?.points ?? LINKEDIN_PROMO_POINTS);
  const affordPosts = POINTS_PER_POST > 0 ? Math.floor(points / POINTS_PER_POST) : 0;

  const verifiedShares = useMemo(() => shareItems.filter(isVerifiedShare), [shareItems]);
  const earnedFromShares = useMemo(
    () => shareItems.reduce((sum, s) => sum + (Number(s.points_awarded) || 0), 0),
    [shareItems],
  );

  const referralLink =
    data?.referral_code && typeof window !== 'undefined'
      ? `${window.location.origin}/r/${data.referral_code}`
      : data?.referral_code
        ? `/r/${data.referral_code}`
        : '';

  async function load() {
    const d = await fetch('/api/ip/viral').then((r) => r.json());
    setData(d);
  }

  useEffect(() => {
    load().catch(() => setData(null));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return shareItems.filter((s) => {
      const verified = isVerifiedShare(s);
      if (filter === 'Verified' && !verified) return false;
      if (filter === 'Pending' && !isPendingShare(s)) return false;
      if (!needle) return true;
      const hay = `${channelLabel(s.channel)} ${postReference(s)} ${statusLabel(s)}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [shareItems, q, filter]);

  const { page, setPage, totalPages, total, pageItems } = useClientPagination(filtered, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, filter, setPage]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function openSubmitModal(shareId = null) {
    setSubmitTargetId(shareId);
    setPostUrlInput('');
    setSubmitModal(true);
  }

  function copyLink() {
    if (!referralLink || typeof window === 'undefined') return;
    const full = `${window.location.origin}/r/${data.referral_code}`;
    navigator.clipboard?.writeText(full);
    setCopied(true);
    showToast('Viral share link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  }

  async function createShare(channel) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/ip/viral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Share failed');

      if (channel === 'linkedin') {
        window.open(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(body.shareUrl)}`,
          '_blank',
        );
        showToast('Opening LinkedIn share dialog. Submit post URL once published!');
      } else if (channel === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(body.suggestedPostText)}`, '_blank');
        showToast('Opening WhatsApp share dialog…');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitPostUrl(e) {
    e.preventDefault();
    const url = postUrlInput.trim();
    if (!url) return;

    setBusy(true);
    setError('');
    try {
      let targetId = submitTargetId;
      if (!targetId) {
        const pending = shareItems.find((s) => s.channel === 'linkedin' && isPendingShare(s));
        if (pending) {
          targetId = pending.id;
        } else {
          const res = await fetch('/api/ip/viral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'linkedin', claimedPostUrl: url }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Submit failed');
          setSubmitModal(false);
          setPostUrlInput('');
          showToast('LinkedIn post URL submitted for verification (~24h check).');
          await load();
          return;
        }
      }

      const res = await fetch(`/api/ip/viral/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimedPostUrl: url }),
    });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Submit failed');

      setSubmitModal(false);
      setPostUrlInput('');
      setSubmitTargetId(null);
      showToast('Post URL submitted for SuperAdmin fast-track verification.');
    await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <div className="ip-ev-loading">Loading viral board…</div>;
  }

  return (
    <div className="ip-emp-vir">
      {toast ? (
        <div className="ip-ev-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-ev-toolbar">
        <div className="ip-ev-crumb">
          <span>Employer Workspace</span>
          <ChevronRight size={14} aria-hidden />
          <strong>Viral Share Board</strong>
        </div>
        <div className="ip-ev-toolbar-actions">
          <div className="ip-ev-pts-pill">
            <span className="ip-ev-pts-pill__dot" aria-hidden>
              <Coins size={12} />
            </span>
            <span>{points} Reward Points</span>
          </div>
          <button type="button" className="ip-ev-btn-primary" onClick={() => openSubmitModal()} disabled={busy}>
            <PlusCircle size={15} aria-hidden />
            Submit Post URL
          </button>
        </div>
      </div>

      {error ? <div className="ip-ev-alert ip-ev-alert--error">{error}</div> : null}

      <div className="ip-ev-hero">
        <div>
          <div className="ip-ev-hero__pill">
            <Share2 size={14} aria-hidden />
            <span>Viral Growth Incentives</span>
          </div>
          <h1>Share PlacementHub &amp; Earn +{rewardPts} Bonus Points</h1>
          <p>
            Promote PlacementHub or your open internships on LinkedIn and social networks. Posts are checked on a
            ~24-hour schedule to credit bonus points to your account once verified.
          </p>
        </div>
        <div className="ip-ev-hero-reward">
          <span>Reward Per Verified Share</span>
          <strong>
            <Sparkles size={22} aria-hidden />
            +{rewardPts} PTS
          </strong>
          <em>Verified after automated check</em>
        </div>
      </div>

      <div className="ip-ev-metrics">
        <div className="ip-ev-metric">
          <div>
            <p>Available Balance</p>
            <h3>{points} Points</h3>
            <div className="ip-ev-metric-sub ip-ev-metric-sub--ok">
              <CheckCircle2 size={13} aria-hidden />
              <span>
                {affordPosts > 0
                  ? `${affordPosts} Posting${affordPosts === 1 ? '' : 's'} ready`
                  : `Need ${POINTS_PER_POST} pts per posting`}
              </span>
            </div>
          </div>
          <div className="ip-ev-metric-icon ip-ev-metric-icon--brand">
            <Wallet size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-ev-metric">
          <div>
            <p>Reward per LinkedIn Share</p>
            <h3>+{rewardPts} Points</h3>
            <div className="ip-ev-metric-sub ip-ev-metric-sub--brand">
              <Award size={13} aria-hidden />
              <span>Credited when verification completes</span>
            </div>
          </div>
          <div className="ip-ev-metric-icon ip-ev-metric-icon--amber">
            <Gift size={22} aria-hidden />
          </div>
        </div>
        <div className="ip-ev-metric">
          <div>
            <p>Tracked Social Shares</p>
            <h3>
              {shareItems.length} Share{shareItems.length === 1 ? '' : 's'}
            </h3>
            <div className="ip-ev-metric-sub ip-ev-metric-sub--ok">
              <TrendingUp size={13} aria-hidden />
              <span>
                {verifiedShares.length > 0
                  ? `${verifiedShares.length} Verified (+${earnedFromShares} Pts earned)`
                  : 'Share link to start earning'}
              </span>
            </div>
          </div>
          <div className="ip-ev-metric-icon ip-ev-metric-icon--blue">
            <Share2 size={22} aria-hidden />
          </div>
        </div>
      </div>

      <div className="ip-ev-card">
        <h3>Your Tracked Referral Link</h3>
        <p className="ip-ev-card__intro">
          Include this URL in your social posts or email campaigns to track signups and scheduled share verification.
        </p>

        <div className="ip-ev-link-row">
          <div className="ip-ev-link">
            <Link2 size={16} aria-hidden />
            <input type="text" readOnly value={referralLink || 'Loading…'} aria-label="Referral link" />
          </div>
          <button type="button" className="ip-ev-btn-primary" onClick={copyLink} disabled={!referralLink || busy}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <div className="ip-ev-share-row">
          <span className="ip-ev-share-label">Quick Share to Channels:</span>
          <div className="ip-ev-share">
            <button type="button" className="ip-ev-share--li" disabled={busy} onClick={() => createShare('linkedin')}>
              <Share2 size={14} aria-hidden />
              Share on LinkedIn (+{rewardPts} Pts)
            </button>
            <button type="button" className="ip-ev-share--wa" disabled={busy} onClick={() => createShare('whatsapp')}>
              <MessageCircle size={14} aria-hidden />
              WhatsApp
            </button>
            <button type="button" className="ip-ev-share--ghost" disabled={busy} onClick={() => openSubmitModal()}>
              <PlusCircle size={14} aria-hidden />
              Submit Post URL
            </button>
          </div>
        </div>
      </div>

      <div className="ip-ev-card">
        <div className="ip-ev-hist-head">
          <div>
            <h2>Share Verification History &amp; Scheduled Checks</h2>
            <p className="ip-ev-card__intro">Track LinkedIn verification checks and rewarded bonus points.</p>
          </div>
        </div>

        {!shareItems.length ? (
          <div className="ip-ev-empty">
            <div className="ip-ev-empty__icon">
              <Share2 size={22} aria-hidden />
            </div>
            <p>
              <strong>No Viral Shares Yet</strong>
              Share your internship link on LinkedIn or social media to start earning +{rewardPts} bonus points per
              verified share!
            </p>
            <div className="ip-ev-empty-actions">
              <button type="button" className="ip-ev-btn-primary" onClick={copyLink} disabled={!referralLink || busy}>
                <Copy size={14} aria-hidden />
                Copy Share Link
              </button>
              <button type="button" className="ip-ev-btn-ghost" disabled={busy} onClick={() => openSubmitModal()}>
                <PlusCircle size={14} aria-hidden />
                Submit Post URL
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="ip-ev-filters">
              <div className="ip-ev-search">
                <Search size={14} aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search shares…"
                  aria-label="Search shares"
                />
              </div>
              <div className="ip-ev-tabs" role="tablist" aria-label="Share status">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="tab"
                    aria-selected={filter === f}
                    className={`ip-ev-tab${filter === f ? ' ip-ev-tab--on' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'Pending Verification' ? 'Pending' : f}
                  </button>
                ))}
              </div>
            </div>

            {!filtered.length ? (
              <div className="ip-ev-empty">
                <p>
                  <strong>No matching shares</strong>
                  Try another search or status filter.
                </p>
              </div>
            ) : (
              <>
                <div className="ip-ev-table-wrap">
                  <table className="ip-ev-table">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Post Link / Reference</th>
                        <th>Shared Date</th>
                        <th>Verification Status</th>
                        <th>Next Check</th>
                        <th style={{ textAlign: 'right' }}>Points Rewarded</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((s) => {
                        const pendingLinkedIn = s.channel === 'linkedin' && isPendingShare(s);
                        return (
                          <tr key={s.id}>
                            <td>
                              <div className="ip-ev-channel">
                                <Share2 size={15} aria-hidden />
                                {channelLabel(s.channel)}
                              </div>
                            </td>
                            <td>
                              <div className="ip-ev-post-ref" title={postReference(s)}>
                                {postReference(s)}
                              </div>
                            </td>
                            <td style={{ color: '#64748b' }}>
                              {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td>
                              <span className={`ip-ev-badge ${badgeClass(s)}`}>{statusLabel(s)}</span>
                            </td>
                            <td style={{ color: '#64748b', fontSize: '0.6875rem' }}>{nextCheckLabel(s)}</td>
                            <td className="ip-ev-pts">{pointsLabel(s, rewardPts)}</td>
                            <td className="ip-ev-action">
                              {pendingLinkedIn ? (
                                <button
                                  type="button"
                                  className="ip-ev-action-btn"
                                  disabled={busy}
                                  onClick={() => openSubmitModal(s.id)}
                                >
                                  Paste URL
                                </button>
                              ) : isVerifiedShare(s) ? (
                                <span className="ip-ev-credited">
                                  <Check size={13} aria-hidden />
                                  Credited
                                </span>
                    ) : (
                      '—'
                    )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 ? (
                  <div className="ip-ev-pager">
                    <button
                      type="button"
                      className="ip-ev-btn-ghost"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Prev
                    </button>
                    <span>
                      {page} / {totalPages} · {total} shown
                    </span>
                    <button
                      type="button"
                      className="ip-ev-btn-ghost"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
              ) : null}
              </>
            )}
          </>
        )}
      </div>

      {submitModal ? (
        <div className="ip-ev-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-ev-submit-title">
          <form className="ip-ev-modal" onSubmit={submitPostUrl}>
            <div className="ip-ev-modal__head">
              <div className="ip-ev-modal__title">
                <span className="ip-ev-modal__icon">
                  <Link2 size={20} aria-hidden />
                </span>
                <h2 id="ip-ev-submit-title">Submit Post for Verification</h2>
              </div>
              <button
                type="button"
                className="ip-ev-modal-close"
                aria-label="Close"
                onClick={() => {
                  setSubmitModal(false);
                  setSubmitTargetId(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <label htmlFor="ip-ev-post-url">LinkedIn or social post URL</label>
            <input
              id="ip-ev-post-url"
              type="url"
              required
              placeholder="e.g. https://linkedin.com/posts/your-name_post-id"
              value={postUrlInput}
              onChange={(e) => setPostUrlInput(e.target.value)}
            />

            <div className="ip-ev-modal-hint">
              <strong>Verification rules:</strong> Post should include your referral link or mention PlacementHub.
              Automated checks run on a ~24-hour schedule to credit <strong>+{rewardPts} points</strong> when verified.
            </div>

            <div className="ip-ev-modal-actions">
              <button
                type="button"
                className="ip-ev-btn-ghost"
                onClick={() => {
                  setSubmitModal(false);
                  setSubmitTargetId(null);
                }}
              >
                Cancel
              </button>
              <button type="submit" className="ip-ev-btn-primary" disabled={busy || !postUrlInput.trim()}>
                Submit for Checking
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
