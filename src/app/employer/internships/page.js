'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  TrendingUp,
  Users,
} from 'lucide-react';
import UrlClaimDialog from '@/components/ip/UrlClaimDialog';
import { useClientPagination } from '@/hooks/useClientPagination';
import '@/components/ip/ip-employer-postings-gemini.css';

const PAGE_SIZE = 10;

function stipendLabel(i) {
  if (i.stipend_type === 'incentive') return 'Incentive-based';
  if (i.stipend_inr) return `₹${i.stipend_inr}/mo`;
  return 'Unpaid';
}

function postedLabel(i) {
  const raw = i.created_at || i.published_at;
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/** UI bucket for badges/filter (live statuses → mock labels). */
function statusBucket(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'published') return 'active';
  if (s === 'paused') return 'paused';
  if (s === 'closed') return 'closed';
  return 'draft';
}

function statusBadgeText(bucket) {
  if (bucket === 'active') return '● Active';
  if (bucket === 'paused') return '⏸ Paused';
  if (bucket === 'closed') return 'Closed';
  return 'Draft';
}

export default function EmployerInternshipsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [promoteFor, setPromoteFor] = useState(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  async function load() {
    const res = await fetch('/api/ip/employer/internships');
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((i) => {
      const bucket = statusBucket(i.status);
      const matchesSearch = !q || String(i.title || '').toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && bucket === 'active') ||
        (statusFilter === 'paused' && bucket === 'paused') ||
        (statusFilter === 'draft' && bucket === 'draft') ||
        (statusFilter === 'closed' && bucket === 'closed');
      return matchesSearch && matchesStatus;
    });
  }, [items, searchQuery, statusFilter]);

  const { page, setPage, totalPages, total, pageItems, serialOffset } = useClientPagination(
    filtered,
    PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, setPage]);

  const activeCount = items.filter((i) => statusBucket(i.status) === 'active').length;
  const totalApplicants = items.reduce((acc, i) => acc + Number(i.applicant_count || 0), 0);

  async function setStatus(id, status) {
    setBusyId(id);
    setError('');
    try {
      const res = await fetch(`/api/ip/employer/internships/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  async function startPromote(i) {
    setBusyId(i.id);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/ip/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId: i.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.shareUrl)}`,
        '_blank'
      );
      setPendingPromotion(data);
      setPromoteFor(i);
      setClaimOpen(true);
      setMsg(`Promotion created. Include token ${data.token} in your post.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId('');
    }
  }

  async function submitClaimUrl(postUrl) {
    if (!pendingPromotion?.id) return;
    setError('');
    try {
      await fetch(`/api/ip/promotions/${pendingPromotion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimedPostUrl: postUrl }),
      });
      setMsg('Submitted for SuperAdmin fast-track verification.');
    } catch (e) {
      setError(e.message || 'Failed to submit URL');
    } finally {
      setPendingPromotion(null);
      setPromoteFor(null);
    }
  }

  function share(i) {
    const url = `${window.location.origin}/candidate/internships/${i.id}`;
    const text = encodeURIComponent(`We're hiring: ${i.title}`);
    return {
      whatsapp: `https://wa.me/?text=${text}%20${encodeURIComponent(url)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    };
  }

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-emp-postings">
      <div className="ip-epo-header">
        <div>
          <h1>Postings</h1>
          <p>
            {items.length} total internship posting{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link href="/employer/internships/new" className="ip-epo-btn ip-epo-btn--primary">
          <Plus className="size-4" aria-hidden />
          Post an internship
        </Link>
      </div>

      {error ? <div className="ip-epo-alert ip-epo-alert--err">{error}</div> : null}
      {msg ? <div className="ip-epo-alert">{msg}</div> : null}

      <div className="ip-epo-stats">
        <div className="ip-epo-stat">
          <span>Total Postings</span>
          <strong>{items.length}</strong>
        </div>
        <div className="ip-epo-stat">
          <span>Active Roles</span>
          <strong className="ip-epo-stat--green">{activeCount}</strong>
        </div>
        <div className="ip-epo-stat">
          <span>Total Applicants</span>
          <strong className="ip-epo-stat--indigo">{totalApplicants}</strong>
        </div>
      </div>

      <section className="ip-epo-card">
        <div className="ip-epo-toolbar">
          <div>
            <h2>Manage Postings</h2>
            <p>Publish, pause, promote, or edit active listings.</p>
          </div>
          <div className="ip-epo-filters">
            <div className="ip-epo-search">
              <Search aria-hidden />
              <input
                type="search"
                placeholder="Search postings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search postings"
              />
            </div>
            <select
              className="ip-epo-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="draft">Draft</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        <div className="ip-epo-table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '3rem' }}>#</th>
                <th>Title</th>
                <th>Stipend</th>
                <th>Applicants</th>
                <th>Status</th>
                <th className="ip-epo-actions-h">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i, idx) => {
                const bucket = statusBucket(i.status);
                const links = share(i);
                return (
                  <tr key={i.id}>
                    <td className="ip-epo-num">{serialOffset + idx + 1}</td>
                    <td>
                      <Link href={`/employer/internships/${i.id}`} className="ip-epo-title">
                        {i.title}
                      </Link>
                      <span className="ip-epo-date">Posted on {postedLabel(i)}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{stipendLabel(i)}</td>
                    <td>
                      <Link href={`/employer/internships/${i.id}`} className="ip-epo-apps">
                        <Users aria-hidden />
                        {Number(i.applicant_count || 0)} candidate
                        {Number(i.applicant_count || 0) === 1 ? '' : 's'}
                      </Link>
                    </td>
                    <td>
                      <span className={`ip-epo-badge ip-epo-badge--${bucket}`}>
                        {statusBadgeText(bucket)}
                      </span>
                    </td>
                    <td>
                      <div className="ip-epo-row-actions">
                        <button
                          type="button"
                          className="ip-epo-btn ip-epo-btn--icon"
                          title="Edit Posting"
                          aria-label="Edit Posting"
                          onClick={() => router.push(`/employer/internships/${i.id}/edit`)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        {i.status === 'published' ? (
                          <button
                            type="button"
                            className="ip-epo-btn ip-epo-btn--icon ip-epo-pause"
                            title="Pause Listing"
                            aria-label="Pause Listing"
                            disabled={busyId === i.id}
                            onClick={() => setStatus(i.id, 'paused')}
                          >
                            <Pause className="size-4" />
                          </button>
                        ) : i.status === 'paused' || i.status === 'draft' ? (
                          <button
                            type="button"
                            className="ip-epo-btn ip-epo-btn--icon ip-epo-play"
                            title="Activate Listing"
                            aria-label="Activate Listing"
                            disabled={busyId === i.id}
                            onClick={() => setStatus(i.id, 'published')}
                          >
                            <Play className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="ip-epo-btn ip-epo-btn--icon"
                          title="Promote + verify"
                          aria-label="Promote + verify"
                          disabled={busyId === i.id}
                          onClick={() => startPromote(i)}
                        >
                          <TrendingUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="ip-epo-btn ip-epo-btn--icon"
                          title="Share on WhatsApp"
                          aria-label="Share on WhatsApp"
                          onClick={() => window.open(links.whatsapp, '_blank', 'noreferrer')}
                        >
                          <MessageCircle className="size-4" />
                        </button>
                        <button
                          type="button"
                          className="ip-epo-btn ip-epo-btn--icon"
                          title="Share on LinkedIn"
                          aria-label="Share on LinkedIn"
                          onClick={() => window.open(links.linkedin, '_blank', 'noreferrer')}
                        >
                          <Share2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length ? (
                <tr>
                  <td colSpan={6} className="ip-epo-empty">
                    {items.length
                      ? 'No internship postings found matching your search.'
                      : 'No postings yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {total > 0 ? (
          <div className="ip-epo-foot">
            <span>
              Showing {from}–{to} of {total}
            </span>
            <div className="ip-epo-foot-nav">
              <button
                type="button"
                className="ip-epo-btn ip-epo-btn--outline"
                disabled={page <= 1}
                onClick={() => setPage(Math.max(1, page - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                className="ip-epo-btn ip-epo-btn--outline"
                disabled={page >= totalPages}
                onClick={() => setPage(Math.min(totalPages, page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <UrlClaimDialog
        open={claimOpen}
        onOpenChange={(open) => {
          setClaimOpen(open);
          if (!open) {
            setPendingPromotion(null);
            setPromoteFor(null);
          }
        }}
        title={promoteFor ? `Fast-track: ${promoteFor.title}` : 'Paste LinkedIn post URL'}
        description="Optional. Paste the public LinkedIn post URL after sharing, or cancel to skip fast-track."
        confirmLabel="Submit for verification"
        onConfirm={submitClaimUrl}
      />
    </div>
  );
}
