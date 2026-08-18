'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Check,
  Clock,
  Cpu,
  Lightbulb,
  RefreshCw,
  Search,
  Settings2,
  ThumbsUp,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-queue-gemini.css';

const PAGE_SIZE = 10;

const STATUS_TABS = [
  { id: 'all', label: 'All Ideas' },
  { id: 'Under review', label: 'Under Review' },
  { id: 'Planned', label: 'Planned' },
  { id: 'In progress', label: 'In Progress' },
  { id: 'Shipped', label: 'Completed' },
];

const TRIAGE_STATUSES = ['Pending approval', 'Under review', 'Planned', 'In progress', 'Shipped', 'Declined'];

function statusTone(status) {
  if (status === 'Shipped') return 'ok';
  if (status === 'In progress') return 'brand';
  if (status === 'Planned') return 'blue';
  if (status === 'Declined') return 'danger';
  return 'warn';
}

function statusLabel(status) {
  if (status === 'Shipped') return 'Completed';
  return status || '—';
}

function priorityMeta(priority) {
  const n = Number(priority);
  if (n === 1) return { label: 'P0 - Critical', tone: 'danger' };
  if (n === 2) return { label: 'High', tone: 'warn' };
  if (n === 3) return { label: 'Medium', tone: 'blue' };
  if (n === 4) return { label: 'Low', tone: 'slate' };
  if (priority == null || priority === '') return { label: '—', tone: 'slate' };
  return { label: `P${n}`, tone: 'slate' };
}

function prioritySelectValue(priority) {
  const n = Number(priority);
  if (n === 1) return 'P0 - Critical';
  if (n === 2) return 'High';
  if (n === 3) return 'Medium';
  if (n === 4) return 'Low';
  return 'Medium';
}

function matchesTab(idea, tab) {
  if (tab === 'all') return true;
  if (tab === 'Under review') {
    return idea.status === 'Under review' || idea.status === 'Pending approval';
  }
  return idea.status === tab;
}

function fmtWhen(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function FeatureIdeasTriagePage() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [triage, setTriage] = useState(null);
  const [editStatus, setEditStatus] = useState('Under review');
  const [editPriority, setEditPriority] = useState('High');
  const [editCategoryId, setEditCategoryId] = useState('none');
  const [adminNote, setAdminNote] = useState('');

  async function load() {
    setError('');
    const [ideasRes, catRes] = await Promise.all([fetch('/api/ip/ideas'), fetch('/api/ip/idea-categories')]);
    const ideasData = await ideasRes.json();
    const catData = await catRes.json().catch(() => ({}));
    if (!ideasRes.ok) {
      setError(ideasData.error || 'Failed to load');
      return;
    }
    setItems(ideasData.items || []);
    setCategories(catData.items || []);
    setSelected([]);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const kpi = useMemo(() => {
    const pending = items.filter((i) => i.status === 'Pending approval' || i.status === 'Under review').length;
    const inProgress = items.filter((i) => i.status === 'In progress').length;
    const top = [...items].sort((a, b) => Number(b.vote_count || 0) - Number(a.vote_count || 0))[0];
    return {
      total: items.length,
      pending,
      inProgress,
      topVotes: top ? Number(top.vote_count || 0) : 0,
      topTitle: top?.title || '—',
    };
  }, [items]);

  const filtered = useMemo(() => {
    let rows = items.filter((i) => matchesTab(i, tab));
    if (categoryFilter !== 'all') {
      rows =
        categoryFilter === 'none'
          ? rows.filter((i) => !i.category_id)
          : rows.filter((i) => i.category_id === categoryFilter);
    }
    if (priorityFilter !== 'all') {
      rows = rows.filter((i) => priorityMeta(i.priority).label === priorityFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((i) =>
        [i.title, i.description, i.author_name, i.category_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [items, tab, categoryFilter, priorityFilter, search]);

  const tabCounts = useMemo(() => {
    const map = { all: items.length };
    for (const t of STATUS_TABS) {
      if (t.id === 'all') continue;
      map[t.id] = items.filter((i) => matchesTab(i, t.id)).length;
    }
    return map;
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [page, totalPages]);

  async function patch(ids, body) {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/ip/superadmin/feature-ideas/${ids[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ids }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Update failed');
      else {
        setToast(ids.length > 1 ? `Updated ${data.processed || ids.length} ideas` : 'Triage saved');
        setTriage(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  function openTriage(idea) {
    setTriage(idea);
    setEditStatus(idea.status || 'Under review');
    setEditPriority(prioritySelectValue(idea.priority));
    setEditCategoryId(idea.category_id || 'none');
    setAdminNote(idea.admin_note || '');
  }

  function saveTriage() {
    if (!triage) return;
    patch([triage.id], {
      status: editStatus,
      priority: editPriority,
      categoryId: editCategoryId === 'none' ? null : editCategoryId,
      adminNote,
    });
  }

  return (
    <div className="ip-sa-q">
      {toast ? (
        <div className="ip-saq-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-saq-head">
        <div>
          <div className="ip-saq-head__title">
            <h1>Feature Ideas Triage</h1>
            <span className="ip-saq-pill ip-saq-pill--warn">{kpi.pending} Pending Triage</span>
          </div>
          <p>Suggestions &amp; product feature requests submitted by candidates and employers for roadmap planning.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="ip-saq-btn ip-saq-btn--icon" aria-label="Refresh" disabled={busy} onClick={load}>
            <RefreshCw size={15} />
          </button>
          <Link href="/ideas" target="_blank" className="ip-saq-btn">
            Public ideas board
          </Link>
        </div>
      </div>

      {error ? <div className="ip-saq-error">{error}</div> : null}

      <div className="ip-saq-metrics">
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Total Submissions</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--indigo">
              <Lightbulb size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.total}</strong>
            <span className="ip-saq-pill ip-saq-pill--brand">Community</span>
          </div>
          <p className="ip-saq-metric__sub">Candidate &amp; employer suggestions</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Pending Triage</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--amber">
              <Clock size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.pending}</strong>
            <span className="ip-saq-pill ip-saq-pill--warn">Requires Review</span>
          </div>
          <p className="ip-saq-metric__sub">Awaiting status allocation</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Active In Progress</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--blue">
              <Cpu size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.inProgress}</strong>
            <span className="ip-saq-pill ip-saq-pill--blue">In Sprint</span>
          </div>
          <p className="ip-saq-metric__sub">Engineered for upcoming updates</p>
        </div>
        <div className="ip-saq-metric">
          <div className="ip-saq-metric__top">
            <span>Top Voted Request</span>
            <div className="ip-saq-metric__ico ip-saq-metric__ico--green">
              <ThumbsUp size={18} aria-hidden />
            </div>
          </div>
          <div className="ip-saq-metric__row">
            <strong>{kpi.topVotes}</strong>
            <span className="ip-saq-pill ip-saq-pill--ok">Upvotes</span>
          </div>
          <p className="ip-saq-metric__sub">{kpi.topTitle}</p>
        </div>
      </div>

      <div className="ip-saq-panel">
        <div className="ip-saq-toolbar">
          <div className="ip-saq-tabs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ip-saq-tab${tab === t.id ? ' ip-saq-tab--on' : ''}`}
                onClick={() => {
                  setTab(t.id);
                  setPage(1);
                }}
              >
                {t.label}
                {t.id === 'all' ? ` (${tabCounts.all || 0})` : ''}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              className="ip-saq-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Category"
            >
              <option value="all">All Categories</option>
              <option value="none">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="ip-saq-select"
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Priority"
            >
              <option value="all">All Priorities</option>
              <option value="P0 - Critical">P0 - Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <div className="ip-saq-search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                placeholder="Search idea title..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </div>

        {selected.length ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <button type="button" className="ip-saq-btn" disabled={busy} onClick={() => patch(selected, { status: 'Planned' })}>
              Bulk → Planned
            </button>
            <button type="button" className="ip-saq-btn" disabled={busy} onClick={() => patch(selected, { status: 'In progress' })}>
              Bulk → In Progress
            </button>
            <button type="button" className="ip-saq-btn ip-saq-btn--emerald" disabled={busy} onClick={() => patch(selected, { status: 'Shipped' })}>
              Bulk → Completed
            </button>
          </div>
        ) : null}

        {!filtered.length ? (
          <div className="ip-saq-empty">
            <Lightbulb size={28} aria-hidden />
            <h4>No feature ideas in this view</h4>
            <p>Candidate and employer suggestions will appear here for roadmap triage.</p>
          </div>
        ) : (
          <>
            <div className="ip-saq-table-wrap">
              <table className="ip-saq-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={pageItems.length > 0 && pageItems.every((i) => selected.includes(i.id))}
                        onChange={(e) => setSelected(e.target.checked ? pageItems.map((i) => i.id) : [])}
                        aria-label="Select page"
                      />
                    </th>
                    <th>Feature Request Title</th>
                    <th>Author</th>
                    <th>Votes</th>
                    <th>Priority</th>
                    <th>Category</th>
                    <th>Roadmap Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((idea) => {
                    const prio = priorityMeta(idea.priority);
                    const role = idea.author_role === 'employer' ? 'Employer' : idea.author_role === 'candidate' ? 'Candidate' : idea.author_role || 'User';
                    return (
                      <tr key={idea.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.includes(idea.id)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked ? [...new Set([...prev, idea.id])] : prev.filter((x) => x !== idea.id),
                              )
                            }
                          />
                        </td>
                        <td>
                          <strong style={{ display: 'block' }}>{idea.title}</strong>
                          <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                            {idea.description || '—'}
                          </span>
                        </td>
                        <td>
                          <strong style={{ display: 'block' }}>{idea.author_name || 'Unknown'}</strong>
                          <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>
                            {role} · {fmtWhen(idea.created_at)}
                          </span>
                        </td>
                        <td>
                          <span className="ip-saq-pill ip-saq-pill--blue">
                            <ArrowUp size={12} aria-hidden /> {idea.vote_count ?? 0}
                          </span>
                        </td>
                        <td>
                          <span className={`ip-saq-pill ip-saq-pill--${prio.tone}`}>{prio.label}</span>
                        </td>
                        <td>
                          <span className="ip-saq-pill ip-saq-pill--slate">{idea.category_name || 'Uncategorized'}</span>
                        </td>
                        <td>
                          <span className={`ip-saq-pill ip-saq-pill--${statusTone(idea.status)}`}>
                            {statusLabel(idea.status)}
                          </span>
                        </td>
                        <td>
                          <button type="button" className="ip-saq-btn ip-saq-btn--sm" onClick={() => openTriage(idea)}>
                            <Settings2 size={14} aria-hidden />
                            Triage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '0.75rem',
                fontSize: '0.75rem',
                color: '#64748b',
              }}
            >
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}{' '}
                feature ideas
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button type="button" className="ip-saq-btn ip-saq-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <span>
                  Page {page}/{totalPages}
                </span>
                <button
                  type="button"
                  className="ip-saq-btn ip-saq-btn--sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {triage ? (
        <div className="ip-saq-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-saq-idea-title">
          <div className="ip-saq-modal ip-saq-modal--wide">
            <div className="ip-saq-modal__head">
              <div className="ip-saq-modal__title">
                <div className="ip-saq-modal__ico">
                  <Settings2 size={18} aria-hidden />
                </div>
                <div>
                  <h3 id="ip-saq-idea-title">Triage feature idea</h3>
                  <span>{triage.title}</span>
                </div>
              </div>
              <button type="button" className="ip-saq-modal-close" aria-label="Close" onClick={() => setTriage(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="ip-saq-modal-body">
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#475569' }}>{triage.description}</p>
              <div className="ip-saq-modal-row">
                <span>Author</span>
                <strong>
                  {triage.author_name || 'Unknown'} ({triage.author_role || 'user'}) · {triage.vote_count ?? 0} votes
                </strong>
              </div>
              <div>
                <label className="ip-saq-label" htmlFor="idea-status">
                  Roadmap status
                </label>
                <select id="idea-status" className="ip-saq-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  {TRIAGE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ip-saq-label" htmlFor="idea-priority">
                  Priority
                </label>
                <select
                  id="idea-priority"
                  className="ip-saq-select"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option>P0 - Critical</option>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <div>
                <label className="ip-saq-label" htmlFor="idea-cat">
                  Category
                </label>
                <select
                  id="idea-cat"
                  className="ip-saq-select"
                  value={editCategoryId}
                  onChange={(e) => setEditCategoryId(e.target.value)}
                >
                  <option value="none">Uncategorized</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ip-saq-label" htmlFor="idea-note">
                  Admin note
                </label>
                <textarea
                  id="idea-note"
                  className="ip-saq-textarea"
                  placeholder="Internal triage note…"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
              </div>
            </div>
            <div className="ip-saq-modal-foot">
              <button type="button" className="ip-saq-btn" onClick={() => setTriage(null)}>
                Cancel
              </button>
              <button type="button" className="ip-saq-btn ip-saq-btn--emerald" disabled={busy} onClick={saveTriage}>
                <Check size={14} aria-hidden />
                Save triage
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
