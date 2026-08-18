'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Briefcase,
  ChevronRight,
  Clock,
  Download,
  GraduationCap,
  MessageSquare,
  Plus,
  Search,
  Users,
} from 'lucide-react';
import '@/components/ip/ip-employer-dashboard-gemini.css';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function stipendLabel(i) {
  if (i.stipend_type === 'incentive') return 'Incentive-based';
  if (i.stipend_inr) return `₹${i.stipend_inr}/mo`;
  return 'Stipend TBD';
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
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const employer = data?.employer;
  const stats = data?.stats || {};
  const postings = data?.postings || [];
  const recent = data?.recentApplications || [];
  const canPost =
    session?.user?.profileComplete && employer?.approvalStatus === 'approved';
  const company = employer?.companyName || 'Employer';
  const avg = Number(stats.avgRating || 0);
  const activePct =
    postings.length && stats.activePostings === postings.length ? '100% Active' : `${stats.activePostings || 0} live`;

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="ip-emp-dash">
      {employer?.approvalStatus && employer.approvalStatus !== 'approved' ? (
        <div className="ip-ed-alert">
          Waiting for SuperAdmin approval — you can prepare draft postings meanwhile.
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
            <span>Export Data (.CSV)</span>
          </a>
          <Link className="ip-ed-btn-light" href="/employer/candidates">
            <Search aria-hidden />
            <span>Find Candidates</span>
          </Link>
        </div>
      </div>

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

          <div className="ip-ed-card">
            <div className="ip-ed-card-head">
              <div>
                <h2>Recent Candidate Applications</h2>
                <p>Candidates who recently applied to your positions.</p>
              </div>
              {(stats.pendingReviews || 0) > 0 ? (
                <span className="ip-ed-pending-pill">{stats.pendingReviews} Pending Review</span>
              ) : null}
            </div>
            <div className="ip-ed-apps-pad">
              {recent.length ? (
                recent.map((a) => (
                  <div key={a.id} className="ip-ed-app">
                    <div className="ip-ed-app-top">
                      <div className="ip-ed-app-person">
                        <span className="ip-ed-avatar">{initials(a.candidate_name)}</span>
                        <div>
                          <h4>{a.candidate_name || 'Candidate'}</h4>
                          <p>{a.internship_title}</p>
                        </div>
                      </div>
                      {a.match_score != null ? (
                        <span className="ip-ed-match">{Math.round(Number(a.match_score))}%</span>
                      ) : null}
                    </div>
                    <div className="ip-ed-app-foot">
                      <span>
                        <GraduationCap
                          aria-hidden
                          style={{ width: 13, height: 13, display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                        />
                        {a.college || '—'}
                        {a.cgpa != null ? ` · CGPA ${a.cgpa}` : ''}
                      </span>
                      <Link href={`/employer/internships/${a.internship_id}`}>
                        {a.resume_url ? 'Review Resume' : 'Review'}
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ip-ed-empty">No applications yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="ip-ed-col">
          <div className="ip-ed-card ip-ed-shortcuts">
            <h2>Workspace Shortcuts</h2>
            <Link className="ip-ed-short" href="/employer/candidates">
              <div className="ip-ed-short-left">
                <span className="ip-ed-short-ico" style={{ background: '#eff6ff', color: '#2563eb' }}>
                  <Users aria-hidden />
                </span>
                <div>
                  <h4>Search Candidates</h4>
                  <p>Invite searchable student profiles</p>
                </div>
              </div>
              <ChevronRight aria-hidden style={{ width: 14, height: 14, color: '#cbd5e1' }} />
            </Link>
            <Link className="ip-ed-short" href="/employer/messages">
              <div className="ip-ed-short-left">
                <span className="ip-ed-short-ico" style={{ background: '#ecfdf5', color: '#059669' }}>
                  <MessageSquare aria-hidden />
                </span>
                <div>
                  <h4>Candidate Messages</h4>
                  <p>Inbox with applicants</p>
                </div>
              </div>
              <ChevronRight aria-hidden style={{ width: 14, height: 14, color: '#cbd5e1' }} />
            </Link>
            <Link className="ip-ed-short" href="/employer/offers">
              <div className="ip-ed-short-left">
                <span className="ip-ed-short-ico" style={{ background: '#fff7ed', color: '#ea580c' }}>
                  <Award aria-hidden />
                </span>
                <div>
                  <h4>Offers & Agreements</h4>
                  <p>Create and track offers</p>
                </div>
              </div>
              <ChevronRight aria-hidden style={{ width: 14, height: 14, color: '#cbd5e1' }} />
            </Link>
            <Link className="ip-ed-short" href="/employer/analytics">
              <div className="ip-ed-short-left">
                <span className="ip-ed-short-ico" style={{ background: '#faf5ff', color: '#9333ea' }}>
                  <BarChart3 aria-hidden />
                </span>
                <div>
                  <h4>Analytics & Funnel</h4>
                  <p>Pipeline and stipend mix</p>
                </div>
              </div>
              <ChevronRight aria-hidden style={{ width: 14, height: 14, color: '#cbd5e1' }} />
            </Link>
          </div>

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
    </div>
  );
}
