'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  Users,
} from 'lucide-react';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import {
  IpDateRangeFilter,
  IpSearchableMultiFilter,
  IpTableFiltersShell,
} from '@/components/ip/IpTableFiltersShell';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import SharePostingDialog from '@/components/ip/SharePostingDialog';
import { useClientPagination } from '@/hooks/useClientPagination';
import { IpListEmpty, IpListLoading } from '@/components/ip/IpListStatus';
import '@/components/ip/ip-employer-postings-gemini.css';
import '@/components/ip/ip-table-filters.css';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';

const PAGE_SIZE = 10;

const EMPTY_COLS = {
  titles: [],
  stipends: [],
  applicants: [],
  dateFrom: '',
  dateTo: '',
};

function stipendLabel(i) {
  return formatInternshipStipend(i, { unpaidLabel: 'Unpaid' }) || 'Unpaid';
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

function dayKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function inDateRange(value, from, to) {
  const key = dayKey(value);
  if (!key) return !(from || to);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function uniqSorted(values) {
  return [...new Set(values.filter((v) => v != null && String(v).trim() !== ''))]
    .map(String)
    .sort((a, b) => a.localeCompare(b));
}

function applicantsLabel(i) {
  const hist = Number(i.applicant_count || 0);
  const active = i.active_applicant_count;
  if (active != null) return `${hist} historical · ${active} active`;
  return `${hist} historical`;
}

function statusBadgeText(bucket) {
  if (bucket === 'active') return '● Live';
  if (bucket === 'scheduled') return '◷ Scheduled';
  if (bucket === 'closing') return 'Closing soon';
  if (bucket === 'paused') return '⏸ Paused';
  if (bucket === 'closed') return 'Closed';
  return 'Draft';
}

function statusBucket(status, lifecycleLabel) {
  const label = String(lifecycleLabel || '').toLowerCase();
  if (label === 'scheduled') return 'scheduled';
  if (label === 'closing soon') return 'closing';
  if (label === 'expired') return 'closed';
  const s = String(status || 'draft').toLowerCase();
  if (s === 'published') return 'active';
  if (s === 'paused') return 'paused';
  if (s === 'closed') return 'closed';
  return 'draft';
}

function countActiveCols(cols) {
  let n = 0;
  for (const [k, v] of Object.entries(cols || {})) {
    const base = EMPTY_COLS[k];
    if (Array.isArray(base)) {
      if (Array.isArray(v) && v.length) n += 1;
    } else if (v) n += 1;
  }
  return n;
}

export default function EmployerInternshipsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cols, setCols] = useState(EMPTY_COLS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [shareFor, setShareFor] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');

  const snapshot = useMemo(
    () => ({ filters: { searchQuery, statusFilter, cols }, sort: '' }),
    [searchQuery, statusFilter, cols],
  );
  const prefs = useListPrefsSync({
    tableKey: 'employer.internships',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.searchQuery != null) setSearchQuery(f.searchQuery);
      if (f.statusFilter) setStatusFilter(f.statusFilter);
      if (f.cols) {
        const incoming = { ...EMPTY_COLS, ...f.cols };
        delete incoming.statuses;
        setCols(incoming);
      }
    },
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/ip/employer/internships');
      const data = await res.json();
      setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((i) => {
      const bucket = statusBucket(i.status, i.lifecycle_label);
      const matchesSearch = !q || String(i.title || '').toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && (bucket === 'active' || bucket === 'scheduled')) ||
        (statusFilter === 'paused' && bucket === 'paused') ||
        (statusFilter === 'draft' && bucket === 'draft') ||
        (statusFilter === 'closed' && bucket === 'closed');
      if (!matchesSearch || !matchesStatus) return false;
      if (cols.titles.length && !cols.titles.includes(String(i.title || ''))) return false;
      if (cols.stipends.length && !cols.stipends.includes(stipendLabel(i))) return false;
      if (cols.applicants.length && !cols.applicants.includes(applicantsLabel(i))) return false;
      if (!inDateRange(i.created_at || i.published_at, cols.dateFrom, cols.dateTo)) return false;
      return true;
    });
  }, [items, searchQuery, statusFilter, cols]);

  const optionLists = useMemo(() => {
    return {
      titles: uniqSorted(items.map((i) => i.title)),
      stipends: uniqSorted(items.map(stipendLabel)),
      applicants: uniqSorted(items.map(applicantsLabel)),
    };
  }, [items]);

  const { page, setPage, totalPages, total, pageItems, serialOffset } = useClientPagination(
    filtered,
    PAGE_SIZE
  );
  const colsActive = countActiveCols(cols);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, cols, setPage]);

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

  async function startLinkedInPromo() {
    if (!shareFor?.id) throw new Error('No Posting Selected');
    setShareBusy(true);
    setShareError('');
    setMsg('');
    try {
      const res = await fetch('/api/ip/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId: shareFor.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could Not Open LinkedIn Share');
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.shareUrl)}`,
        '_blank',
        'noreferrer',
      );
      setPendingPromotion(data);
      setMsg(`LinkedIn Share Opened. Include Share Code ${data.token} In Your Post.`);
      return data;
    } catch (e) {
      setShareError(e.message || 'Could Not Open LinkedIn Share');
      throw e;
    } finally {
      setShareBusy(false);
    }
  }

  async function submitClaimUrl(postUrl) {
    if (!pendingPromotion?.id) return;
    setShareBusy(true);
    setShareError('');
    try {
      const res = await fetch(`/api/ip/promotions/${pendingPromotion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimedPostUrl: postUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed To Submit URL');
      setMsg('Submitted For SuperAdmin Fast-Track Verification.');
      setPendingPromotion(null);
      setShareFor(null);
      setShareOpen(false);
    } catch (e) {
      setShareError(e.message || 'Failed To Submit URL');
    } finally {
      setShareBusy(false);
    }
  }

  function whatsappShareUrl(i) {
    const url = `${window.location.origin}/candidate/internships/${i.id}`;
    const text = encodeURIComponent(`We're hiring: ${i.title}`);
    return `https://wa.me/?text=${text}%20${encodeURIComponent(url)}`;
  }

  function openShare(i) {
    setShareError('');
    setPendingPromotion(null);
    setShareFor(i);
    setShareOpen(true);
  }

  function renderRowActions(i) {
    return (
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
        {i.status === 'closed' || i.lifecycle_label === 'Expired' ? (
          <button
            type="button"
            className="ip-epo-btn ip-epo-btn--icon"
            title="Repost / Duplicate"
            aria-label="Repost Duplicate"
            disabled={busyId === i.id}
            onClick={async () => {
              setBusyId(i.id);
              try {
                const res = await fetch(`/api/ip/employer/internships/${i.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'repost' }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                router.push(`/employer/internships/${data.id}/edit`);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusyId('');
              }
            }}
          >
            <Plus className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          className="ip-epo-btn ip-epo-btn--icon"
          title="Share Posting"
          aria-label="Share Posting"
          onClick={() => openShare(i)}
        >
          <Share2 className="size-4" />
        </button>
      </div>
    );
  }

  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="ip-emp-postings ip-mobile-bleed">
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

      {error ? <div className="ip-epo-alert ip-epo-alert--err ip-mobile-inset">{error}</div> : null}
      {msg ? <div className="ip-epo-alert ip-mobile-inset">{msg}</div> : null}

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
            <p>Publish, pause, share, or edit active listings.</p>
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
        <div className="px-4 pb-3">
          <ListPresetsBar {...prefs} />
          <IpTableFiltersShell
            open={filtersOpen}
            onToggle={() => setFiltersOpen((v) => !v)}
            activeCount={colsActive}
            onClear={() => setCols(EMPTY_COLS)}
          >
            <IpSearchableMultiFilter
              label="Title"
              options={optionLists.titles}
              values={cols.titles}
              onChange={(titles) => setCols((c) => ({ ...c, titles }))}
              placeholder="Search titles…"
            />
            <IpSearchableMultiFilter
              label="Stipend"
              options={optionLists.stipends}
              values={cols.stipends}
              onChange={(stipends) => setCols((c) => ({ ...c, stipends }))}
              placeholder="Search stipends…"
            />
            <IpSearchableMultiFilter
              label="Applicants"
              options={optionLists.applicants}
              values={cols.applicants}
              onChange={(applicants) => setCols((c) => ({ ...c, applicants }))}
              placeholder="Search applicant counts…"
            />
            <IpDateRangeFilter
              label="Posted date"
              from={cols.dateFrom}
              to={cols.dateTo}
              onFrom={(dateFrom) => setCols((c) => ({ ...c, dateFrom }))}
              onTo={(dateTo) => setCols((c) => ({ ...c, dateTo }))}
            />
          </IpTableFiltersShell>
        </div>

        {loading ? (
          <IpListLoading label="Loading Postings…" />
        ) : !filtered.length ? (
          <IpListEmpty
            title={items.length ? 'No Matching Postings' : 'No Postings Yet'}
            hint={
              items.length
                ? 'No Internship Postings Found Matching Your Search.'
                : 'Create A Posting To See It Listed Here.'
            }
          />
        ) : (
          <>
        <div className="ip-epo-cards" aria-label="Postings cards">
          {pageItems.map((i) => {
            const bucket = statusBucket(i.status, i.lifecycle_label);
            return (
              <article key={i.id} className="ip-epo-mcard">
                <div className="ip-epo-mcard__head">
                  <div className="min-w-0">
                    <Link href={`/employer/internships/${i.id}`} className="ip-epo-title">
                      {i.title}
                    </Link>
                    <p className="ip-epo-date">
                      Posted on {postedLabel(i)}
                      {i.capacity_label ? ` · ${i.capacity_label}` : ''}
                      {i.lifecycle_label ? ` · ${i.lifecycle_label}` : ''}
                    </p>
                  </div>
                  <span className={`ip-epo-badge ip-epo-badge--${bucket}`}>
                    {statusBadgeText(bucket)}
                  </span>
                </div>
                <p className="ip-epo-mcard__meta">
                  {stipendLabel(i)} · {Number(i.applicant_count || 0)} applicants
                  {i.active_applicant_count != null ? ` · ${i.active_applicant_count} active` : ''}
                </p>
                <Link href={`/employer/internships/${i.id}`} className="ip-epo-btn ip-epo-btn--primary ip-epo-mcard__manage">
                  <Users className="size-4" aria-hidden />
                  Manage applicants
                </Link>
                {renderRowActions(i)}
              </article>
            );
          })}
        </div>

        <div className="ip-ph-list-wrap ip-epo-table-wrap">
          <table className="ip-ph-list ip-epo-table">
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
                const bucket = statusBucket(i.status, i.lifecycle_label);
                return (
                  <tr key={i.id}>
                    <td className="ip-epo-num">{serialOffset + idx + 1}</td>
                    <td>
                      <Link href={`/employer/internships/${i.id}`} className="ip-epo-title">
                        {i.title}
                      </Link>
                      <span className="ip-epo-date">
                        Posted on {postedLabel(i)}
                        {i.capacity_label ? ` · ${i.capacity_label}` : ''}
                        {i.lifecycle_label ? ` · ${i.lifecycle_label}` : ''}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{stipendLabel(i)}</td>
                    <td>
                      <Link href={`/employer/internships/${i.id}`} className="ip-epo-apps">
                        <Users aria-hidden />
                        {Number(i.applicant_count || 0)} historical
                        {i.active_applicant_count != null
                          ? ` · ${i.active_applicant_count} active`
                          : ''}
                      </Link>
                    </td>
                    <td>
                      <span className={`ip-epo-badge ip-epo-badge--${bucket}`}>
                        {statusBadgeText(bucket)}
                      </span>
                    </td>
                    <td>{renderRowActions(i)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          </>
        )}

        {!loading && total > 0 ? (
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

      <SharePostingDialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setShareFor(null);
            setPendingPromotion(null);
            setShareError('');
          }
        }}
        postingTitle={shareFor?.title || ''}
        busy={shareBusy}
        error={shareError}
        onWhatsApp={() => {
          if (!shareFor) return;
          window.open(whatsappShareUrl(shareFor), '_blank', 'noreferrer');
          setShareOpen(false);
          setShareFor(null);
        }}
        onStartLinkedInPromo={startLinkedInPromo}
        onSubmitClaim={submitClaimUrl}
      />
    </div>
  );
}
