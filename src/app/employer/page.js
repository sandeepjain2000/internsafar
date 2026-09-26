'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Briefcase,
  Clock,
  Download,
  MessageSquare,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import '@/components/ip/ip-employer-dashboard-gemini.css';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';
import { readResponseJson } from '@/lib/readResponseJson';

function stipendLabel(i) {
  return formatInternshipStipend(i, { unpaidLabel: 'Stipend TBD' }) || 'Stipend TBD';
}

function modeLabel(i) {
  const mode = i.work_mode || '';
  const loc = i.location || '';
  if (mode && loc) return `${mode} (${loc})`;
  return mode || loc || '—';
}

export default function EmployerDashboard() {
  const { data: session } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ip/employer/dashboard')
      .then((r) => readResponseJson(r, {}))
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const employer = data?.employer;
  const stats = data?.stats || {};
  const actionCenter = data?.actionCenter || {};
  const stalePending = Number(actionCenter.pendingReviewStaleDays || 0);
  const documentsUploaded = Number(actionCenter.documentsUploaded || 0);
  const postings = data?.postings || [];
  const finalApproved = employer?.approvalStatus === 'approved';
  const canPost = finalApproved && employer?.emailVerified !== false;
  const profileComplete = Boolean(employer?.profileComplete);
  // Action center priority (first matching wins):
  // 1) Upload docs (no uploads yet, still awaiting Final Approval)
  // 2) Complete profile (after docs uploaded, or anytime profile incomplete once docs are done)
  // 3) Stale applications (can post)
  // 4) Waiting for Final Approval (docs + profile done, not approved yet)
  let primaryAction = null;
  if (!finalApproved && documentsUploaded === 0) {
    primaryAction = 'upload_docs';
  } else if (!profileComplete) {
    primaryAction = 'complete_profile';
  } else if (canPost) {
    primaryAction = 'stale_apps';
  } else if (!finalApproved) {
    primaryAction = 'await_approval';
  }

  const actionScore = (() => {
    if (primaryAction === 'upload_docs') {
      return { value: 1, href: '/employer/profile', hint: 'Upload verification documents', needs: true };
    }
    if (primaryAction === 'complete_profile') {
      return { value: 1, href: '/employer/profile', hint: 'Finish your company profile', needs: true };
    }
    if (primaryAction === 'stale_apps') {
      return {
        value: stalePending,
        href: '/employer/internships',
        hint:
          stalePending > 0
            ? 'Applications waiting for your review (3+ days)'
            : 'No applications waiting for review',
        needs: stalePending > 0,
      };
    }
    if (primaryAction === 'await_approval') {
      return { value: 1, href: '/employer/profile', hint: 'Waiting for Final Approval', needs: true };
    }
    return { value: 0, href: '/employer/internships', hint: 'No tasks right now', needs: false };
  })();

  const company = employer?.companyName || 'Employer';
  const avg = Number(stats.avgRating || 0);
  const activePct =
    postings.length && stats.activePostings === postings.length ? '100% Active' : `${stats.activePostings || 0} live`;

  if (loading && !data) {
    return (
      <div className="ip-emp-dash ip-mobile-bleed">
        <div className="ip-ed-banner">
          <div>
            <span className="ip-ed-org-pill">Organization Portal</span>
            <h1>Welcome back, {session?.user?.name || 'Employer'}!</h1>
            <p>Loading workspace…</p>
          </div>
        </div>
        <div className="ip-ed-stats">
          {['Active Postings', 'Total Applicants', 'Pending Reviews', 'Reward Points'].map((label) => (
            <div key={label} className="ip-ed-stat">
              <div className="ip-ed-stat-top"><span>{label}</span></div>
              <div className="ip-ed-stat-row"><strong>—</strong></div>
            </div>
          ))}
        </div>
        <div className="ip-ed-card ip-ed-shortcuts">
          <h2>Workspace Shortcuts</h2>
          <p className="ip-ed-empty">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ip-emp-dash ip-mobile-bleed">
      {employer?.approvalStatus && employer.approvalStatus !== 'approved' ? (
        <div className="ip-ed-alert">
          Waiting for SuperAdmin approval — complete your profile and upload verification documents under
          Profile &amp; docs. Postings stay unavailable until Final Employer Approval.
        </div>
      ) : null}

      <div className="ip-ed-banner">
        <div>
          <span className="ip-ed-org-pill">Organization Portal</span>
          <h1>Welcome back, {company}!</h1>
          <p>Manage active internship postings, track candidate applications, and schedule interview offers.</p>
        </div>
        <div className="ip-ed-banner-actions">
          <a className="ip-ed-btn-ghost" href="/api/ip/employer/export">
            <Download aria-hidden />
            <span>Export overview (.xlsx)</span>
          </a>
          <Link className="ip-ed-btn-light" href="/employer/candidates">
            <Search aria-hidden />
            <span>Find Candidates</span>
          </Link>
        </div>
      </div>

      <Link
        className={`ip-ed-action-score${actionScore.needs ? ' is-warn' : ''}`}
        href={actionScore.href}
        data-testid="employer-action-center"
      >
        <span className="ip-ed-action-score__label">Action center</span>
        <span className="ip-ed-action-score__row">
          <strong className="ip-ed-action-score__value">{actionScore.value}</strong>
          <span className="ip-ed-action-score__link">{actionScore.hint}</span>
        </span>
      </Link>

      <div className="ip-ed-stats">
        <div className="ip-ed-stat">
          <div className="ip-ed-stat-top">
            <span>Active Postings</span>
            <span className="ip-ed-stat-ico ip-ed-stat-ico--green">
              <Briefcase aria-hidden />
            </span>
          </div>
          <div className="ip-ed-stat-row">
            <strong>{stats.activePostings ?? 0}</strong>
            <span className="ip-ed-chip ip-ed-chip--green">{activePct}</span>
          </div>
          <p>Published listings currently accepting applications</p>
        </div>

        <div className="ip-ed-stat">
          <div className="ip-ed-stat-top">
            <span>Total Applicants</span>
            <span className="ip-ed-stat-ico ip-ed-stat-ico--brand">
              <Users aria-hidden />
            </span>
          </div>
          <div className="ip-ed-stat-row">
            <strong>{stats.totalApplicants ?? 0}</strong>
            <span className="ip-ed-chip ip-ed-chip--brand">
              +{stats.applicantsThisWeek ?? 0} this week
            </span>
          </div>
          <p>Across your internship listings</p>
        </div>

        <div className="ip-ed-stat">
          <div className="ip-ed-stat-top">
            <span>Pending Reviews</span>
            <span className="ip-ed-stat-ico ip-ed-stat-ico--amber">
              <Clock aria-hidden />
            </span>
          </div>
          <div className="ip-ed-stat-row">
            <strong>{stats.pendingReviews ?? 0}</strong>
            {(stats.pendingReviews || 0) > 0 ? (
              <span className="ip-ed-chip ip-ed-chip--amber">Needs Action</span>
            ) : (
              <span className="ip-ed-chip ip-ed-chip--green">Clear</span>
            )}
          </div>
          <p>Applications awaiting review</p>
        </div>

        <div className="ip-ed-stat">
          <div className="ip-ed-stat-top">
            <span>Reward Points</span>
            <span className="ip-ed-stat-ico ip-ed-stat-ico--purple">
              <Award aria-hidden />
            </span>
          </div>
          <div className="ip-ed-stat-row">
            <strong>
              {stats.points ?? 0} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>pts</span>
            </strong>
            <span className="ip-ed-chip ip-ed-chip--purple">
              {stats.postingsLeft ?? 0} Postings Left
            </span>
          </div>
          <p>{stats.pointsPerPost ?? 50} points per new internship posting</p>
        </div>
      </div>

      <div className="ip-ed-card ip-ed-shortcuts">
        <h2>Workspace Shortcuts</h2>
        <div className="ip-ed-short-grid">
          <Link className="ip-ed-short" href="/employer/candidates">
            <span className="ip-ed-short-ico" aria-hidden>
              <Users />
            </span>
            <h4>Search Candidates</h4>
            <p>Invite searchable student profiles</p>
          </Link>
          <Link className="ip-ed-short" href="/employer/messages">
            <span className="ip-ed-short-ico" aria-hidden>
              <MessageSquare />
            </span>
            <h4>Candidate Messages</h4>
            <p>Inbox with applicants</p>
          </Link>
          <Link className="ip-ed-short" href="/employer/offers">
            <span className="ip-ed-short-ico" aria-hidden>
              <Award />
            </span>
            <h4>Offers &amp; Agreements</h4>
            <p>Create and track offers</p>
          </Link>
          <Link className="ip-ed-short" href="/employer/analytics">
            <span className="ip-ed-short-ico" aria-hidden>
              <BarChart3 />
            </span>
            <h4>Analytics &amp; Funnel</h4>
            <p>Pipeline and stipend mix</p>
          </Link>
        </div>
      </div>

      {canPost ? (
      <div className="ip-ed-grid">
        <div className="ip-ed-col">
          <div className="ip-ed-card">
            <div className="ip-ed-card-head">
              <div>
                <h2>Active Internship Postings</h2>
                <p>Manage live listings and view applicant volume.</p>
              </div>
              <Link className="ip-ed-link" href="/employer/internships">
                <span>View All</span>
                <ArrowRight aria-hidden />
              </Link>
            </div>
            {postings.length ? (
              postings.map((post) => (
                <div key={post.id} className="ip-ed-post">
                  <div>
                    <div className="ip-ed-post-title">
                      <Link href={`/employer/internships/${post.id}`}>{post.title}</Link>
                      <span className="ip-ed-active">Active</span>
                    </div>
                    <p className="ip-ed-meta">
                      {modeLabel(post)} · {stipendLabel(post)}
                    </p>
                  </div>
                  <div className="ip-ed-post-right">
                    <div className="ip-ed-apps-count">
                      <strong>{post.applicant_count || 0}</strong>
                      <span>Applicants</span>
                    </div>
                    <Link className="ip-ed-btn-outline" href={`/employer/internships/${post.id}`}>
                      Manage
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="ip-ed-empty">No published postings yet.</p>
            )}
            <div style={{ padding: '1rem', borderTop: '1px solid #f1f5f9' }}>
              <Link
                className="ip-ed-btn"
                href="/employer/internships/new"
                aria-disabled={!canPost}
                onClick={(e) => {
                  if (!canPost) e.preventDefault();
                }}
                style={!canPost ? { pointerEvents: 'none', opacity: 0.55 } : undefined}
              >
                <Plus aria-hidden />
                <span>Post New Internship</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="ip-ed-col">
          <div className="ip-ed-card ip-ed-rep">
            <h2>Employer Reputation</h2>
            <div className="ip-ed-stars">
              {avg > 0 ? avg.toFixed(1) : '—'} <span>/ 5.0 · {stats.ratingCount || 0} ratings</span>
            </div>
            <div className="ip-ed-verified">
              {employer?.approvalStatus === 'approved'
                ? 'Verified employer account — approved by SuperAdmin.'
                : 'Complete profile and await SuperAdmin approval for the verified badge.'}
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="ip-ed-card" style={{ marginTop: '1.25rem' }}>
          <h2>Next step</h2>
          <p className="ip-ed-empty" style={{ paddingBottom: '0.5rem' }}>
            Postings unlock after SuperAdmin Final Employer Approval. Upload your documents under Profile &amp; docs
            so review can proceed.
          </p>
          <Link className="ip-ed-btn" href="/employer/profile">
            <span>Open Profile &amp; docs</span>
            <ArrowRight aria-hidden />
          </Link>
        </div>
      )}
    </div>
  );
}
