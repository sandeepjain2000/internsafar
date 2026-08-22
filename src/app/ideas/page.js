'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Bell,
  BellOff,
  Check,
  ChevronUp,
  Info,
  Lightbulb,
  LightbulbOff,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import '@/components/ip/ip-candidate-ideas-gemini.css';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';

const STATUS_TABS = [
  { id: 'all', label: 'All Ideas' },
  { id: 'under_review', label: 'Under Review', dot: 'under_review' },
  { id: 'planned', label: 'Planned', dot: 'planned' },
  { id: 'in_progress', label: 'In Progress', dot: 'in_progress' },
  { id: 'completed', label: 'Completed', dot: 'completed' },
];

function roadmapBucket(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'shipped' || s === 'completed') return 'completed';
  if (s === 'planned') return 'planned';
  if (s === 'in progress' || s === 'in_progress') return 'in_progress';
  if (s === 'declined') return 'declined';
  return 'under_review';
}

function statusLabel(bucket) {
  if (bucket === 'in_progress') return 'In Progress';
  if (bucket === 'planned') return 'Planned';
  if (bucket === 'completed') return 'Completed';
  if (bucket === 'declined') return 'Declined';
  return 'Under Review';
}

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function similarIdeas(title, items) {
  const words = String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
  if (!words.length) return [];
  return items
    .filter((idea) => {
      const t = String(idea.title || '').toLowerCase();
      return words.some((w) => t.includes(w));
    })
    .slice(0, 3);
}

export default function FeatureIdeasPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const userId = session?.user?.id;
  const canSubmit = role === 'candidate' || role === 'employer';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useViewMode('ip_ideas_view', 'cards');
  const [filter, setFilter] = useState('all');
  const [categoryId, setCategoryId] = useState('all');
  const [sortBy, setSortBy] = useState('most_voted');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  }

  async function load() {
    const res = await fetch('/api/ip/ideas');
    const data = await res.json().catch(() => null);
    setItems(data?.items || []);
    setLoading(false);
  }

  async function loadCategories() {
    const res = await fetch('/api/ip/idea-categories');
    const data = await res.json().catch(() => null);
    setCategories(data?.items || []);
  }

  useEffect(() => {
    if (status === 'authenticated') {
      load();
      loadCategories();
    }
  }, [status]);

  const counts = useMemo(() => {
    const c = { all: items.length, under_review: 0, planned: 0, in_progress: 0, completed: 0, declined: 0 };
    items.forEach((idea) => {
      const b = roadmapBucket(idea.status);
      if (c[b] != null) c[b] += 1;
    });
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((idea) => {
      const bucket = roadmapBucket(idea.status);
      if (filter !== 'all' && bucket !== filter) return false;
      if (categoryId !== 'all' && String(idea.category_id || '') !== categoryId) return false;
      if (!q) return true;
      return `${idea.title || ''} ${idea.problem || ''} ${idea.solution || ''} ${idea.description || ''} ${idea.category_name || ''}`
        .toLowerCase()
        .includes(q);
    });
    list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'recently_updated') {
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      }
      return (b.vote_count || 0) - (a.vote_count || 0);
    });
    return list;
  }, [items, filter, categoryId, search, sortBy]);

  const duplicates = useMemo(() => similarIdeas(title, items), [title, items]);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim() || !problem.trim() || !solution.trim() || !formCategoryId) {
      showToast('Please fill in title, category, problem, and proposed improvement.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ip/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          problem: problem.trim(),
          solution: solution.trim(),
          categoryId: formCategoryId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not submit idea.');
        return;
      }
      setTitle('');
      setProblem('');
      setSolution('');
      setFormCategoryId('');
      setFormOpen(false);
      await load();
      showToast('Idea submitted. It is under review by the product team.');
    } finally {
      setSubmitting(false);
    }
  }

  async function vote(id) {
    const res = await fetch(`/api/ip/ideas/${id}/vote`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    await load();
    if (detail?.id === id) {
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              voted_by_me: data.voted,
              vote_count: Math.max(0, (prev.vote_count || 0) + (data.voted ? 1 : -1)),
            }
          : prev,
      );
    }
    showToast(data.voted ? 'Vote recorded. One vote per account.' : 'Vote removed.');
  }

  async function follow(id) {
    const res = await fetch(`/api/ip/ideas/${id}/follow`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    await load();
    if (detail?.id === id) {
      setDetail((prev) => (prev ? { ...prev, followed_by_me: data.following } : prev));
    }
    showToast(data.following ? 'Following. You will be notified of team updates.' : 'Unfollowed.');
  }

  async function openDetail(idea) {
    setDetail(idea);
    setCommentDraft('');
    const res = await fetch(`/api/ip/ideas/${idea.id}/comments`);
    const data = await res.json().catch(() => ({}));
    setComments(data.items || []);
  }

  async function postComment() {
    if (!detail || !commentDraft.trim()) return;
    setCommentBusy(true);
    try {
      const res = await fetch(`/api/ip/ideas/${detail.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentDraft.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not post comment.');
        return;
      }
      setComments((prev) => [...prev, data.item]);
      setCommentDraft('');
      await load();
      showToast('Comment posted.');
    } finally {
      setCommentBusy(false);
    }
  }

  function resetFilters() {
    setFilter('all');
    setCategoryId('all');
    setSearch('');
    setSortBy('most_voted');
  }

  if (status === 'loading' || status === 'unauthenticated') {
    return <div className="ip-cand-ideas">Loading…</div>;
  }

  const liveDetail = detail ? items.find((i) => i.id === detail.id) || detail : null;

  return (
    <div className="ip-cand-ideas">
      {toast ? (
        <div className="ip-ci-toast" role="status">
          {toast}
        </div>
      ) : null}

      <div className="ip-ci-header">
        <div>
          <div className="ip-ci-title">
            <h1>Feature Ideas & Product Roadmap</h1>
            <span className="ip-ci-pill">Community Feedback</span>
          </div>
          <p>Share product feedback, vote on feature requests, and follow progress updates from our team.</p>
        </div>
        {canSubmit ? (
          <button type="button" className="ip-ci-btn ip-ci-btn--primary" onClick={() => setFormOpen(true)}>
            <Plus size={16} aria-hidden />
            Suggest an Idea
          </button>
        ) : null}
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      <div className="ip-ci-toolbar">
        <div className="ip-ci-search-row">
          <div className="ip-ci-search">
            <Search aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suggestions by keyword, problem, or topic..."
              aria-label="Search ideas"
            />
          </div>
          <div className="ip-ci-filters">
            <select
              className="ip-ci-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="ip-ci-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort ideas"
            >
              <option value="most_voted">Most Voted</option>
              <option value="newest">Newest</option>
              <option value="recently_updated">Recently Updated</option>
            </select>
          </div>
        </div>
        <div className="ip-ci-tabs" role="tablist" aria-label="Idea status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={filter === tab.id ? 'is-on' : ''}
              onClick={() => setFilter(tab.id)}
            >
              {tab.dot ? <span className={`ip-ci-dot ip-ci-dot--${tab.dot}`} aria-hidden /> : null}
              <span>{tab.label}</span>
              <span className="ip-ci-tab-count">{counts[tab.id] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ip-ci-policy">
        <div>
          <Info aria-hidden />
          <span>
            <strong>Voting Policy:</strong> Voting shows support for an idea. The product team reviews
            suggestions regularly. Votes do not guarantee an implementation date.
          </span>
        </div>
        <em>1 vote per account</em>
      </div>

      {loading ? (
        <div className="ip-ci-empty">
          <p>Loading ideas…</p>
        </div>
      ) : filtered.length ? (
        viewMode === 'list' ? (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="p-3">Idea</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Votes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => (
                  <tr key={idea.id} className="border-b">
                    <td className="p-3">
                      <button type="button" className="font-medium text-indigo-700" onClick={() => openDetail(idea)}>
                        {idea.title}
                      </button>
                    </td>
                    <td className="p-3">{statusLabel(roadmapBucket(idea.status))}</td>
                    <td className="p-3">{idea.vote_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <ul className="ip-ci-list">
          {filtered.map((idea) => {
            const bucket = roadmapBucket(idea.status);
            const voted = !!idea.voted_by_me;
            const following = !!idea.followed_by_me;
            const own = idea.author_user_id === userId;
            return (
              <li key={idea.id} className="ip-ci-card">
                <button
                  type="button"
                  className={`ip-ci-vote${voted ? ' is-on' : ''}`}
                  onClick={() => vote(idea.id)}
                  aria-pressed={voted}
                  title={voted ? 'Remove vote' : 'Vote'}
                >
                  <ChevronUp aria-hidden />
                  <span>{idea.vote_count || 0}</span>
                </button>
                <div className="ip-ci-main">
                  <div className="ip-ci-card-top">
                    <h3>
                      <button type="button" onClick={() => openDetail(idea)}>
                        {idea.title}
                      </button>
                    </h3>
                    <div className="ip-ci-badges">
                      {idea.category_name ? <span className="ip-ci-cat">{idea.category_name}</span> : null}
                      <span className={`ip-ci-status ip-ci-status--${bucket}`}>{statusLabel(bucket)}</span>
                    </div>
                  </div>
                  {idea.problem ? <p className="ip-ci-desc">{idea.problem}</p> : null}
                  <div className="ip-ci-meta">
                    <span>
                      Suggested by <strong>{idea.author_name || 'Unknown'}</strong>
                      {own ? ' (you)' : ''} • {formatWhen(idea.created_at)}
                    </span>
                    <div className="ip-ci-card-actions">
                      <button
                        type="button"
                        className={`ip-ci-follow${following ? ' is-on' : ''}`}
                        onClick={() => follow(idea.id)}
                      >
                        {following ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
                        {following ? 'Following' : 'Follow'}
                      </button>
                      <button type="button" className="ip-ci-comments" onClick={() => openDetail(idea)}>
                        {idea.comment_count || 0} comment{(idea.comment_count || 0) === 1 ? '' : 's'}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        )
      ) : (
        <div className="ip-ci-empty">
          <div className="ip-ci-empty__icon">
            <LightbulbOff size={28} aria-hidden />
          </div>
          <h3>No suggestions found</h3>
          <p>
            There are no feature ideas matching your current filter selection or search terms.
          </p>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            <button type="button" className="ip-ci-btn" onClick={resetFilters}>
              <RotateCcw size={14} aria-hidden />
              Reset Filters
            </button>
            {canSubmit ? (
              <button type="button" className="ip-ci-btn ip-ci-btn--primary" onClick={() => setFormOpen(true)}>
                <Plus size={14} aria-hidden />
                Suggest First Idea
              </button>
            ) : null}
          </div>
        </div>
      )}

      {formOpen && canSubmit ? (
        <div className="ip-ci-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-ci-suggest-title">
          <div className="ip-ci-modal">
            <div className="ip-ci-modal__head">
              <div>
                <h2 id="ip-ci-suggest-title">Suggest a Feature Improvement</h2>
                <p>Describe the problem and how we can make the internship portal better.</p>
              </div>
              <button type="button" className="ip-ci-modal__x" onClick={() => setFormOpen(false)} aria-label="Close">
                <X />
              </button>
            </div>
            <form onSubmit={submit}>
              <div className="ip-ci-modal__body">
                <div className="ip-ci-field">
                  <label htmlFor="ip-ci-title">Feature title / short summary *</label>
                  <input
                    id="ip-ci-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Export application history to PDF / CSV"
                    required
                    autoFocus
                  />
                </div>
                {title.trim().length >= 4 && duplicates.length ? (
                  <div className="ip-ci-dup">
                    <strong>
                      <Search size={14} aria-hidden />
                      Similar suggestions found
                    </strong>
                    {duplicates.map((idea) => (
                      <button
                        key={idea.id}
                        type="button"
                        onClick={() => {
                          setFormOpen(false);
                          openDetail(idea);
                        }}
                      >
                        Vote on “{idea.title}” instead of duplicating
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="ip-ci-field">
                  <label htmlFor="ip-ci-cat">Category *</label>
                  <select
                    id="ip-ci-cat"
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                    required
                  >
                    <option value="">Select a category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="ip-ci-field">
                  <label htmlFor="ip-ci-problem">What problem are you facing? *</label>
                  <textarea
                    id="ip-ci-problem"
                    rows={2}
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    placeholder="Describe the difficulty or limitation you currently encounter..."
                    required
                  />
                </div>
                <div className="ip-ci-field">
                  <label htmlFor="ip-ci-solution">How would your proposed improvement help? *</label>
                  <textarea
                    id="ip-ci-solution"
                    rows={2}
                    value={solution}
                    onChange={(e) => setSolution(e.target.value)}
                    placeholder="Explain what feature or change would solve this..."
                    required
                  />
                </div>
                <div className="ip-ci-hint">
                  <Check size={16} color="#059669" aria-hidden />
                  <span>
                    Submissions start as <strong>Under Review</strong> (Pending approval until SuperAdmin
                    triages). Votes do not guarantee a ship date.
                  </span>
                </div>
              </div>
              <div className="ip-ci-modal__foot">
                <button type="button" className="ip-ci-btn" onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="ip-ci-btn ip-ci-btn--primary" disabled={submitting}>
                  <Send size={14} aria-hidden />
                  {submitting ? 'Submitting…' : 'Submit Idea for Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {liveDetail ? (
        <div className="ip-ci-overlay" role="dialog" aria-modal="true" aria-labelledby="ip-ci-detail-title">
          <div className="ip-ci-modal ip-ci-modal--wide">
            <div className="ip-ci-modal__head">
              <div className="ip-ci-badges">
                {liveDetail.category_name ? <span className="ip-ci-cat">{liveDetail.category_name}</span> : null}
                <span className={`ip-ci-status ip-ci-status--${roadmapBucket(liveDetail.status)}`}>
                  {statusLabel(roadmapBucket(liveDetail.status))}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`ip-ci-follow${liveDetail.followed_by_me ? ' is-on' : ''}`}
                  onClick={() => follow(liveDetail.id)}
                >
                  {liveDetail.followed_by_me ? <Bell size={14} /> : <BellOff size={14} />}
                  {liveDetail.followed_by_me ? 'Following' : 'Follow Idea'}
                </button>
                <button type="button" className="ip-ci-modal__x" onClick={() => setDetail(null)} aria-label="Close">
                  <X />
                </button>
              </div>
            </div>
            <div className="ip-ci-modal__body">
              <div>
                <h2 id="ip-ci-detail-title" style={{ margin: 0, fontSize: '1.125rem' }}>
                  {liveDetail.title}
                </h2>
                <p style={{ margin: '0.375rem 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Suggested by <strong style={{ color: '#334155' }}>{liveDetail.author_name || 'Unknown'}</strong>
                  {liveDetail.author_user_id === userId ? ' (you)' : ''} • {formatWhen(liveDetail.created_at)} •{' '}
                  {liveDetail.vote_count || 0} votes
                </p>
              </div>
              <div className="ip-ci-block">
                <h4>Problem description</h4>
                <p>{liveDetail.problem || liveDetail.description || '—'}</p>
              </div>
              {liveDetail.solution ? (
                <div className="ip-ci-block ip-ci-block--brand">
                  <h4>Proposed improvement</h4>
                  <p>{liveDetail.solution}</p>
                </div>
              ) : null}
              {liveDetail.admin_note ? (
                <div className="ip-ci-update">
                  <h4>
                    <Sparkles size={16} aria-hidden />
                    Product team response
                  </h4>
                  <p>{liveDetail.admin_note}</p>
                </div>
              ) : null}
              <div className="ip-ci-thread">
                <h4 style={{ margin: 0, fontSize: '0.6875rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Discussion ({comments.length})
                </h4>
                {comments.length ? (
                  comments.map((c) => (
                    <div
                      key={c.id}
                      className={`ip-ci-comment${c.author_role === 'superadmin' ? ' is-official' : ''}`}
                    >
                      <header>
                        <strong>
                          {c.author_role === 'superadmin' ? 'Product team' : c.author_name || 'User'}
                        </strong>
                        <span>{formatWhen(c.created_at)}</span>
                      </header>
                      <p>{c.body}</p>
                    </div>
                  ))
                ) : (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>No comments yet.</p>
                )}
                <div className="ip-ci-comment-form">
                  <input
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    placeholder="Add your feedback or additional context..."
                    maxLength={2000}
                  />
                  <button
                    type="button"
                    className="ip-ci-btn ip-ci-btn--primary"
                    disabled={commentBusy || !commentDraft.trim()}
                    onClick={postComment}
                  >
                    Comment
                  </button>
                </div>
              </div>
            </div>
            <div className="ip-ci-modal__foot">
              <button type="button" className="ip-ci-btn" onClick={() => vote(liveDetail.id)}>
                <ChevronUp size={16} color="#4f46e5" aria-hidden />
                {liveDetail.voted_by_me ? 'Remove vote' : 'Upvote Idea'}
              </button>
              <button type="button" className="ip-ci-btn" onClick={() => setDetail(null)}>
                Close Discussion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
