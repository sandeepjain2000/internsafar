'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  MoreHorizontal,
  RotateCcw,
  Search,
  SearchX,
  SlidersHorizontal,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import '@/components/ip/ip-superadmin-candidates.css';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { onTablistKeyDown } from '@/lib/tablistKeys';
import { IpToastItem } from '@/components/ip/IpToast';
import {
  APPLICATION_STATUSES,
  APPS_FILTER_LABEL,
  LIST_DEFAULTS,
  LOGIN_FILTER_LABEL,
  OFFERS_FILTER_LABEL,
  PAGE_SIZES,
  PANEL_KEYS,
  candidateMatches,
  candidatesCsv,
  capitalize,
  chipLabel,
  companyApplications,
  compareCandidates,
  daysSince,
  downloadText,
  educationLine,
  formatDate,
  freshListState,
  initialsOf,
  isFilterSet,
  listStateFromQuery,
  listStateToQuery,
  relativeDate,
  statusLabel,
  statusTone,
} from '@/lib/ipSuperadminCandidatesView';

function Pill({ tone = 'slate', plain = false, children, title }) {
  return (
    <span className={`sac-pill sac-pill--${tone}${plain ? ' sac-pill--plain' : ''}`} title={title}>
      {children}
    </span>
  );
}

function StatusPill({ status }) {
  return <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>;
}

function NameHiddenPill() {
  return (
    <Pill tone="slate">
      <EyeOff className="w-3 h-3" aria-hidden />
      Name hidden on posting
    </Pill>
  );
}

function ProfilePill({ complete }) {
  return complete ? <Pill tone="green">Complete</Pill> : <Pill tone="amber">Incomplete</Pill>;
}

function uniqSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function SuperAdminCandidatesPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const sessionRole = session?.user?.role;
  const beginLoad = useLatestRequest();

  const [candidates, setCandidates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [cap, setCap] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [S, setS] = useState(freshListState);
  const [ready, setReady] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [combo, setCombo] = useState({ open: false, text: '', active: -1, editing: false });
  const [menu, setMenu] = useState(null);
  const [toasts, setToasts] = useState([]);
  const searchTimer = useRef(null);
  const comboRef = useRef(null);

  const toast = useCallback((msg) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, msg }]);
  }, []);

  useEffect(() => {
    const initial = listStateFromQuery(window.location.search);
    setS(initial);
    setSearchText(initial.q);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const q = listStateToQuery(S);
    const next = `${window.location.pathname}${q ? `?${q}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [S, ready]);

  async function load() {
    const isCurrent = beginLoad();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ip/superadmin/candidates', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!isCurrent()) return;
      if (!res.ok) {
        setError(data.error || `Failed to load (${res.status})`);
        setCandidates([]);
        return;
      }
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      setCompanies(Array.isArray(data.companies) ? data.companies : []);
      setTruncated(Boolean(data.truncated));
      setCap(Number(data.cap) || 0);
    } catch (e) {
      if (!isCurrent()) return;
      setError(e.message || 'Failed to load');
      setCandidates([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (sessionRole === 'superadmin') {
      load();
      return;
    }
    setLoading(false);
    if (sessionStatus === 'authenticated') {
      setError(`Forbidden — Candidates requires SuperAdmin. Your session role is “${sessionRole || 'unknown'}”.`);
    }
  }, [sessionRole, sessionStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const companyName = useCallback((id) => companyById.get(id)?.name || 'Unknown company', [companyById]);
  const postingTitle = useCallback(
    (companyId, postingId) => companyById.get(companyId)?.postings.find((p) => p.id === postingId)?.title || '—',
    [companyById],
  );

  // A company filter from the URL that no longer exists would hide everyone.
  useEffect(() => {
    if (loading || !S.company || companyById.has(S.company)) return;
    setS((s) => ({ ...s, company: '', cPosting: '', cStatus: '' }));
  }, [loading, S.company, companyById]);

  const filtered = useMemo(
    () => candidates.filter((c) => candidateMatches(c, S)).sort(compareCandidates(S)),
    [candidates, S],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / S.size));
  const page = Math.min(S.page, pages);
  const rows = filtered.slice((page - 1) * S.size, page * S.size);
  const pageIds = rows.map((c) => c.id);

  const stats = useMemo(() => {
    const total = candidates.length;
    return {
      total,
      complete: candidates.filter((c) => c.profileComplete).length,
      applied: candidates.filter((c) => c.applications.length).length,
      accepted: candidates.filter((c) => c.offers.some((o) => o.status === 'accepted')).length,
      never: candidates.filter((c) => !c.returned).length,
      week: candidates.filter((c) => daysSince(c.registeredAt) <= 7).length,
    };
  }, [candidates]);

  const tabCounts = useMemo(() => {
    const cnt = (p) => candidates.filter((c) => candidateMatches(c, { ...S, profile: p })).length;
    return { all: cnt('all'), complete: cnt('complete'), incomplete: cnt('incomplete') };
  }, [candidates, S]);

  const noFilters = !S.q && S.profile === 'all' && !S.company && !PANEL_KEYS.some((k) => isFilterSet(S, k));
  const panelCount = PANEL_KEYS.filter((k) => isFilterSet(S, k)).length;

  function update(patch, { keepPage = false } = {}) {
    setS((s) => ({ ...s, ...patch, ...(keepPage ? {} : { page: 1 }) }));
  }

  function clearAll() {
    setS((s) => ({ ...freshListState(), sort: s.sort, dir: s.dir, size: s.size }));
    setSearchText('');
  }

  function clearKey(k) {
    if (k === 'q') setSearchText('');
    setS((s) => {
      const next = { ...s, [k]: Array.isArray(LIST_DEFAULTS[k]) ? [] : LIST_DEFAULTS[k], page: 1 };
      if (k === 'company') {
        next.cPosting = '';
        next.cStatus = '';
      }
      if (k === 'state') next.city = '';
      return next;
    });
  }

  function tileSet(k, v) {
    setS((s) => ({ ...s, [k]: s[k] === v ? LIST_DEFAULTS[k] : v, page: 1 }));
  }

  function onSearch(v) {
    setSearchText(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => update({ q: v }), 250);
  }

  function setPanelField(k, v) {
    setS((s) => {
      const next = { ...s, [k]: v, page: 1 };
      if (k === 'country' && v && v !== 'India') {
        next.state = '';
        next.city = '';
      }
      if (k === 'state') next.city = '';
      return next;
    });
  }

  function toggleStatus(st) {
    setS((s) => ({
      ...s,
      statuses: s.statuses.includes(st) ? s.statuses.filter((x) => x !== st) : [...s.statuses, st],
      page: 1,
    }));
  }

  function resetPanel() {
    setS((s) => {
      const next = { ...s, page: 1 };
      for (const k of PANEL_KEYS) next[k] = Array.isArray(LIST_DEFAULTS[k]) ? [] : LIST_DEFAULTS[k];
      return next;
    });
  }

  function sortBy(k) {
    setS((s) =>
      s.sort === k
        ? { ...s, dir: s.dir === 'asc' ? 'desc' : 'asc', page: 1 }
        : { ...s, sort: k, dir: k === 'name' ? 'asc' : 'desc', page: 1 },
    );
  }

  function goPage(p) {
    update({ page: p }, { keepPage: true });
    window.scrollTo({ top: 0 });
  }

  function toggleSel(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = pageIds.every((i) => next.has(i));
      pageIds.forEach((i) => (all ? next.delete(i) : next.add(i)));
      return next;
    });
  }

  function detailHref(id) {
    const q = listStateToQuery({ ...S, page });
    return `/superadmin/candidates/${encodeURIComponent(id)}${q ? `?list=${encodeURIComponent(q)}` : ''}`;
  }

  function openDetail(id) {
    setMenu(null);
    router.push(detailHref(id));
  }

  function copyEmail(c) {
    try {
      navigator.clipboard?.writeText(c.email).catch(() => {});
    } catch {
      /* clipboard unavailable */
    }
    toast(`Copied ${c.email}`);
  }

  function viewCv(c) {
    if (!c.cvUrl) {
      toast(`${c.name} hasn't uploaded a CV yet`);
      return;
    }
    window.open(c.cvUrl, '_blank', 'noopener,noreferrer');
  }

  function adjustPoints(c) {
    if (!c.active) {
      toast('Adjust Points only lists active accounts');
      return;
    }
    router.push(`/superadmin/points?q=${encodeURIComponent(c.email)}`);
  }

  function exportRows(list, label) {
    if (!list.length) return;
    downloadText(`candidates-${label}-${todayStamp()}.csv`, candidatesCsv(list, companyName));
    toast(`Exported ${list.length} candidate${list.length === 1 ? '' : 's'} (CSV)`);
  }

  /* ---------- company combobox ---------- */
  const comboOptions = useMemo(() => {
    const cur = S.company ? companyById.get(S.company) : null;
    let t = combo.text.trim().toLowerCase();
    if (cur && t === cur.name.toLowerCase()) t = '';
    const appliedCount = new Map();
    for (const c of candidates) {
      for (const id of new Set(c.applications.map((a) => a.employerId))) {
        appliedCount.set(id, (appliedCount.get(id) || 0) + 1);
      }
    }
    return companies
      .filter((c) => c.name.toLowerCase().includes(t))
      .map((c) => ({ ...c, applied: appliedCount.get(c.id) || 0 }))
      .sort((a, b) => b.applied - a.applied || a.name.localeCompare(b.name));
  }, [combo.text, companies, candidates, S.company, companyById]);

  function setCompany(id) {
    update({ company: id, cPosting: '', cStatus: '' });
    setCombo({ open: false, text: '', active: -1, editing: false });
  }

  function comboKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCombo((c) => {
        const max = comboOptions.length - 1;
        const i = e.key === 'ArrowDown' ? Math.min(c.active + 1, max) : Math.max(c.active - 1, 0);
        return { ...c, open: true, active: i };
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = comboOptions[combo.active >= 0 ? combo.active : 0];
      if (o) setCompany(o.id);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setCombo({ open: false, text: '', active: -1, editing: false });
      e.currentTarget.blur();
    }
  }

  useEffect(() => {
    function onDocClick(e) {
      if (comboRef.current && !comboRef.current.contains(e.target)) {
        setCombo((c) => (c.open || c.editing ? { open: false, text: '', active: -1, editing: false } : c));
      }
      if (!e.target.closest?.('[data-sac-menu]')) setMenu(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setMenu(null);
        if (window.innerWidth < 768) setPanelOpen(false);
      }
    }
    function onScroll() {
      setMenu(null);
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  function openRowMenu(e, c) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const h = 190;
    const w = 176;
    setMenu({
      c,
      left: Math.max(8, r.right - w),
      top: r.bottom + h + 8 > window.innerHeight ? r.top - h - 4 : r.bottom + 4,
    });
  }

  /* ---------- derived panel + strip ---------- */
  const india = candidates.filter((c) => c.country === 'India');
  const locOff = Boolean(S.country) && S.country !== 'India';
  const panelOptions = {
    country: uniqSorted(candidates.map((c) => c.country)),
    state: uniqSorted(india.map((c) => c.state)),
    city: uniqSorted(india.filter((c) => !S.state || c.state === S.state).map((c) => c.city)),
    degree: uniqSorted(candidates.map((c) => c.degree)),
    college: uniqSorted(candidates.map((c) => c.college)),
    year: uniqSorted(candidates.map((c) => c.gradYear)),
  };

  const activeCompany = S.company ? companyById.get(S.company) : null;
  const strip = useMemo(() => {
    if (!activeCompany) return null;
    const id = activeCompany.id;
    const appsAll = candidates.flatMap((c) => c.applications.filter((a) => a.employerId === id));
    return {
      appsAll,
      applied: candidates.filter((c) => c.applications.some((a) => a.employerId === id)).length,
      contacted: candidates.filter(
        (c) => c.contacts.some((x) => x.employerId === id) && !c.applications.some((a) => a.employerId === id),
      ).length,
    };
  }, [activeCompany, candidates]);

  const chips = [];
  if (S.q) chips.push(['q', `Search: “${S.q}”`]);
  if (S.profile !== 'all') chips.push(['profile', `Profile: ${capitalize(S.profile)}`]);
  if (activeCompany) chips.push(['company', `Applied to: ${activeCompany.name}`]);
  if (activeCompany && S.cPosting) chips.push(['cPosting', `Posting: ${postingTitle(S.company, S.cPosting)}`]);
  if (activeCompany && S.cStatus) chips.push(['cStatus', `Status at ${activeCompany.name}: ${statusLabel(S.cStatus)}`]);
  PANEL_KEYS.forEach((k) => {
    if (isFilterSet(S, k)) chips.push([k, chipLabel(k, S[k])]);
  });

  const onPage = pageIds.filter((i) => selected.has(i)).length;
  const pageAllSelected = pageIds.length > 0 && onPage === pageIds.length;
  const allMatchingSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  const selectedRows = candidates.filter((c) => selected.has(c.id));
  const start = filtered.length ? (page - 1) * S.size + 1 : 0;

  /* ---------- cells ---------- */
  function nameLine(c) {
    return (
      <>
        <span className="truncate">{c.name}</span>
        {c.searchable ? null : (
          <EyeOff className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Hidden from employer search" />
        )}
        {c.active ? null : <Pill tone="rose">Deactivated</Pill>}
      </>
    );
  }

  function appsCell(c) {
    const n = c.applications.length;
    const nco = new Set(c.applications.map((a) => a.employerId)).size;
    if (!n) return <span className="text-slate-500 font-semibold">0</span>;
    return (
      <>
        <div className="font-extrabold text-[14px] text-slate-900">{n}</div>
        <div className="text-[11px] text-slate-500 whitespace-nowrap">
          across {nco} compan{nco === 1 ? 'y' : 'ies'}
        </div>
      </>
    );
  }

  function latestCell(c) {
    const list = S.company ? companyApplications(c, S) : c.applications;
    if (list.length) {
      const a = [...list].sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)))[0];
      return (
        <>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 truncate max-w-[130px]">{companyName(a.employerId)}</span>
            <StatusPill status={a.status} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[220px]">
            {a.postingTitle} · {relativeDate(a.updatedAt)}
          </div>
        </>
      );
    }
    const ct = (S.company && c.contacts.find((x) => x.employerId === S.company)) || c.contacts[0];
    if (ct) {
      return (
        <div className="text-[11px] font-medium text-slate-500">
          Contacted by {companyName(ct.employerId)} · no application
        </div>
      );
    }
    return <span className="text-slate-300">—</span>;
  }

  function loginCell(c) {
    return c.returned ? relativeDate(c.lastLoginAt) : <Pill tone="amber">Not since sign-up</Pill>;
  }

  function educationCell(c) {
    const line = educationLine(c);
    return (
      <>
        <div className="font-semibold text-slate-800 truncate max-w-[210px]" title={line}>
          {line || <span className="sac-na">Not added</span>}
        </div>
        {c.gradYear ? <div className="text-[11px] text-slate-500">Class of {c.gradYear}</div> : null}
      </>
    );
  }

  function locationCell(c) {
    const line = [c.city, c.state].filter(Boolean).join(', ');
    return (
      <>
        <div className="text-slate-700 whitespace-nowrap">{line || '—'}</div>
        {c.country && c.country !== 'India' ? (
          <div className="text-[11px] font-bold text-amber-600">{c.country}</div>
        ) : null}
      </>
    );
  }

  function sortHeader(key, label, extra = '') {
    const on = S.sort === key;
    return (
      <th
        className={`sac-th sac-th--sortable ${extra}`}
        aria-sort={on ? (S.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className="sac-sort-btn" onClick={() => sortBy(key)}>
          {label} <span aria-hidden>{on ? (S.dir === 'asc' ? '↑' : '↓') : ''}</span>
        </button>
      </th>
    );
  }

  function selectField(k, label, pairs, disabled = false) {
    return (
      <div className="sac-fld">
        <label htmlFor={`sac-f-${k}`}>{label}</label>
        <select
          id={`sac-f-${k}`}
          className="sac-sel"
          value={S[k]}
          disabled={disabled}
          onChange={(e) => setPanelField(k, e.target.value)}
        >
          <option value="">Any</option>
          {pairs.map((x) => {
            const [v, l] = Array.isArray(x) ? x : [x, x];
            return (
              <option key={v} value={v}>
                {l}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  const header = (
    <>
      <div className="text-[12px] font-medium text-slate-500 mb-1">
        SuperAdmin / <span className="text-slate-600">Candidates</span>
      </div>
    </>
  );

  /* ---------- states ---------- */
  if (loading) {
    return (
      <div className="ip-sac" aria-busy="true">
        <div className="sac-skel h-4 w-40 mb-3" />
        <div className="sac-skel h-8 w-56 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sac-skel h-28" />
          ))}
        </div>
        <div className="sac-card p-5 space-y-3">
          <div className="sac-skel h-9 w-full" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="sac-skel h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ip-sac">
        {header}
        <h1 className="mb-6">Candidates</h1>
        <div className="sac-card">
          <div className="sac-empty">
            <span className="sac-eicon bg-rose-50 text-rose-500">
              <AlertTriangle className="w-6 h-6" aria-hidden />
            </span>
            <div className="font-bold text-slate-900 text-[15px]">Couldn&apos;t load candidates</div>
            <div className="text-[12px] text-slate-500 mt-1 max-w-sm">{error}</div>
            {sessionRole === 'superadmin' ? (
              <button type="button" className="sac-btn mt-4" onClick={load}>
                <RotateCcw className="w-4 h-4" aria-hidden />
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!candidates.length) {
    return (
      <div className="ip-sac">
        {header}
        <h1 className="mb-6">Candidates</h1>
        <div className="sac-card">
          <div className="sac-empty">
            <span className="sac-eicon">
              <Users className="w-6 h-6" aria-hidden />
            </span>
            <div className="font-bold text-slate-900 text-[15px]">No candidates yet</div>
            <div className="text-[12px] text-slate-500 mt-1 max-w-sm">
              Candidates appear here after they sign up on InternSafar.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tiles = [
    ['Total candidates', Users, 'slate', stats.total, `+${stats.week} in the last 7 days`, noFilters, clearAll],
    [
      'Profile complete',
      UserCheck,
      'green',
      stats.complete,
      `${stats.total ? Math.round((stats.complete / stats.total) * 100) : 0}% of all candidates`,
      S.profile === 'complete',
      () => tileSet('profile', 'complete'),
    ],
    [
      'Applied at least once',
      Briefcase,
      'blue',
      stats.applied,
      `${stats.accepted} with an accepted offer`,
      S.apps === '1+',
      () => tileSet('apps', '1+'),
    ],
    [
      'Never returned after sign-up',
      UserMinus,
      'amber',
      stats.never,
      'Signed up, never signed in again',
      S.login === 'never',
      () => tileSet('login', 'never'),
    ],
  ];

  const comboValue = combo.editing ? combo.text : activeCompany?.name || '';
  const noResultsCompanyOnly =
    activeCompany && !S.cPosting && !S.cStatus && !S.q && PANEL_KEYS.every((k) => !isFilterSet(S, k));

  return (
    <div className="ip-sac" data-testid="sa-candidates">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          {header}
          <div className="flex items-center gap-3">
            <h1>Candidates</h1>
            <Pill tone="indigo">+{stats.week} this week</Pill>
          </div>
          <p className="text-[12px] text-slate-500 mt-1.5">
            Browse candidate accounts, profiles, applications and company activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="sac-btn" onClick={() => exportRows(filtered, 'filtered')} disabled={!filtered.length}>
            <Download className="w-4 h-4 text-slate-400" aria-hidden />
            <span>Export ({filtered.length})</span>
          </button>
          <button
            type="button"
            className="sac-btn"
            onClick={() => exportRows(selectedRows, 'selected')}
            disabled={!selected.size}
          >
            Export selected ({selected.size})
          </button>
        </div>
      </div>

      {truncated ? (
        <div className="sac-warn mb-4" role="status">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            Showing the newest {cap.toLocaleString('en-IN')} candidates. Older accounts are not loaded on this page.
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {tiles.map(([label, Icon, tone, n, sub, on, fn]) => (
          <button
            key={label}
            type="button"
            className={`sac-tile${on ? ' sac-tile--on' : ''}`}
            onClick={fn}
            aria-pressed={on}
          >
            <div className="flex justify-between items-start gap-2">
              <span className="sac-lbl">{label}</span>
              <span className={`sac-ticon sac-t-${tone}`}>
                <Icon className="w-[18px] h-[18px]" aria-hidden />
              </span>
            </div>
            <div className="text-[24px] font-black text-slate-900 leading-none mt-1">{n}</div>
            <div className="text-[11px] font-medium text-slate-500 mt-1.5">{sub}</div>
          </button>
        ))}
      </div>

      <div className="sac-card p-4 md:p-5 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row justify-between gap-3 lg:items-center">
          <div className="sac-seg" role="tablist" onKeyDown={onTablistKeyDown} aria-label="Profile status">
            {[
              ['all', 'All'],
              ['complete', 'Complete'],
              ['incomplete', 'Incomplete'],
            ].map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={S.profile === v}
                className={S.profile === v ? 'is-on' : ''}
                onClick={() => update({ profile: v })}
              >
                {l}
                <span className="sac-cnt">{tabCounts[v]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative sm:w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                aria-hidden
              />
              <input
                className="sac-search"
                type="search"
                placeholder="Search name, email, phone, college"
                aria-label="Search candidates"
                value={searchText}
                onChange={(e) => onSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <div ref={comboRef} className="relative flex-1 sm:w-60">
                <Building2
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                  aria-hidden
                />
                <input
                  className="sac-combo"
                  placeholder="Applied to company…"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={combo.open}
                  aria-controls="sac-company-list"
                  aria-label="Applied to company"
                  value={comboValue}
                  onFocus={() => setCombo({ open: true, text: activeCompany?.name || '', active: -1, editing: true })}
                  onChange={(e) => setCombo({ open: true, text: e.target.value, active: e.target.value ? 0 : -1, editing: true })}
                  onKeyDown={comboKey}
                />
                {activeCompany ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    onClick={() => setCompany('')}
                    aria-label="Clear company filter"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden />
                  </button>
                ) : null}
                {combo.open ? (
                  <div
                    id="sac-company-list"
                    role="listbox"
                    className="sac-menu absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-y-auto"
                  >
                    {comboOptions.length ? (
                      comboOptions.map((c, i) => (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={c.id === S.company}
                          className={`sac-mi${i === combo.active ? ' is-act' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setCompany(c.id)}
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block truncate">{c.name}</span>
                            <span className="block text-[11px] font-medium text-slate-500">
                              {[c.city, c.nameHidden ? 'name hidden on posting' : ''].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </span>
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">{c.applied} applied</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-3 text-[12px] text-slate-500">No company matches “{combo.text}”</div>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="sac-btn shrink-0"
                onClick={() => setPanelOpen((o) => !o)}
                aria-expanded={panelOpen}
                aria-controls="sac-fpanel"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" aria-hidden />
                Filters
                {panelCount ? <span className="sac-badge">{panelCount}</span> : null}
              </button>
            </div>
          </div>
        </div>

        {panelOpen ? (
          <>
            <div className="fixed inset-0 bg-slate-900/40 z-[55] md:hidden" onClick={() => setPanelOpen(false)} />
            <div id="sac-fpanel" className="sac-fpanel">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold text-slate-900 text-[14px]">More filters</div>
                <button
                  type="button"
                  className="sac-btn sac-btn--icon md:hidden"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close filters"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="space-y-3">
                  <div className="sac-lbl">Account</div>
                  {selectField('reg', 'Registered', [
                    ['7', 'Last 7 days'],
                    ['30', 'Last 30 days'],
                    ['90', 'Last 90 days'],
                  ])}
                  {selectField('login', 'Last login', Object.entries(LOGIN_FILTER_LABEL))}
                  {selectField('account', 'Account status', [
                    ['active', 'Active'],
                    ['deactivated', 'Deactivated'],
                  ])}
                </div>
                <div className="space-y-3">
                  <div className="sac-lbl">Location</div>
                  {selectField('country', 'Country', panelOptions.country)}
                  {selectField('state', 'State', panelOptions.state, locOff)}
                  {selectField('city', 'City', panelOptions.city, locOff)}
                  {locOff ? (
                    <div className="text-[11px] text-slate-500">State and city are listed for India only.</div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  <div className="sac-lbl">Education</div>
                  {selectField('degree', 'Degree', panelOptions.degree)}
                  {selectField('college', 'College', panelOptions.college)}
                  {selectField('year', 'Grad year', panelOptions.year)}
                </div>
                <div className="space-y-3">
                  <div className="sac-lbl">Applications</div>
                  <fieldset className="sac-fld">
                    <legend className="text-[12px] font-bold text-slate-900 mb-1.5">Status (any application)</legend>
                    <div className="grid grid-cols-2 gap-1.5">
                      {APPLICATION_STATUSES.map((st) => (
                        <label key={st} className="flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            className="sac-cb"
                            checked={S.statuses.includes(st)}
                            onChange={() => toggleStatus(st)}
                          />
                          {statusLabel(st)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {selectField('apps', 'Number of applications', Object.entries(APPS_FILTER_LABEL))}
                  {selectField('offers', 'Offers', Object.entries(OFFERS_FILTER_LABEL))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" className="sac-btn sac-btn--ghost" onClick={resetPanel}>
                  Reset filters
                </button>
                <button type="button" className="sac-btn sac-btn--dark" onClick={() => setPanelOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {chips.length ? (
            <>
              <span className="sac-lbl mr-1">Active filters</span>
              {chips.map(([k, l]) => (
                <span key={k} className="sac-chip">
                  <span className="truncate">{l}</span>
                  <button type="button" onClick={() => clearKey(k)} aria-label={`Remove ${l}`}>
                    <X className="w-3 h-3" aria-hidden />
                  </button>
                </span>
              ))}
              <button type="button" className="sac-link ml-1" onClick={clearAll}>
                Clear all
              </button>
            </>
          ) : null}
          <span className="ml-auto text-[12px] font-bold text-slate-500">
            {filtered.length} of {candidates.length} candidates
          </span>
        </div>

        {activeCompany && strip ? (
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-[12px] p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="sac-av bg-white text-indigo-700 border-indigo-100">{initialsOf(activeCompany.name)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-900 text-[14px]">{activeCompany.name}</span>
                  {activeCompany.nameHidden ? <NameHiddenPill /> : null}
                </div>
                <div className="text-[12px] text-slate-500">
                  {[
                    activeCompany.city,
                    `${strip.applied} candidate${strip.applied === 1 ? '' : 's'} applied`,
                    `${strip.appsAll.length} application${strip.appsAll.length === 1 ? '' : 's'}`,
                    `${activeCompany.postings.length} posting${activeCompany.postings.length === 1 ? '' : 's'}`,
                    strip.contacted ? `${strip.contacted} contacted without applying` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                className="sac-sel w-auto"
                value={S.cPosting}
                onChange={(e) => update({ cPosting: e.target.value })}
                aria-label="Posting"
              >
                <option value="">All postings</option>
                {activeCompany.postings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({strip.appsAll.filter((a) => a.postingId === p.id).length})
                  </option>
                ))}
              </select>
              <select
                className="sac-sel w-auto"
                value={S.cStatus}
                onChange={(e) => update({ cStatus: e.target.value })}
                aria-label="Status at this company"
              >
                <option value="">Any status at this company</option>
                {APPLICATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {statusLabel(st)} (
                    {strip.appsAll.filter((a) => a.status === st && (!S.cPosting || a.postingId === S.cPosting)).length})
                  </option>
                ))}
              </select>
              <Link href="/superadmin/approvals" className="sac-btn h-8 text-indigo-600">
                <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                Employer approvals
              </Link>
            </div>
          </div>
        ) : null}

        {selected.size ? (
          <div className="flex flex-wrap items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-[12px] px-3 py-2 text-[12px]">
            <span className="font-bold text-indigo-800">{selected.size} selected</span>
            {pageAllSelected && !allMatchingSelected && filtered.length > pageIds.length ? (
              <button
                type="button"
                className="sac-link"
                onClick={() => setSelected((prev) => new Set([...prev, ...filtered.map((c) => c.id)]))}
              >
                Select all {filtered.length} matching
              </button>
            ) : null}
            <button type="button" className="sac-link" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
            <button type="button" className="sac-btn h-8 ml-auto" onClick={() => exportRows(selectedRows, 'selected')}>
              <Download className="w-3.5 h-3.5" aria-hidden />
              Export selected
            </button>
          </div>
        ) : null}

        {filtered.length ? (
          <div>
            <div className="hidden md:block border border-slate-200 rounded-[12px] overflow-x-auto">
              <table className="w-full min-w-[1080px]" data-testid="sa-candidates-table">
                <thead>
                  <tr>
                    <th className="sac-th w-10">
                      <input
                        type="checkbox"
                        className="sac-cb"
                        checked={pageAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = onPage > 0 && onPage < pageIds.length;
                        }}
                        onChange={togglePage}
                        aria-label="Select all on this page"
                      />
                    </th>
                    {sortHeader('name', 'Candidate')}
                    <th className="sac-th">Education</th>
                    <th className="sac-th">Location</th>
                    <th className="sac-th">Profile</th>
                    {sortHeader('apps', 'Applications', 'text-right')}
                    <th className="sac-th">Latest application</th>
                    {sortHeader('lastLoginAt', 'Last login')}
                    {sortHeader('registeredAt', 'Registered')}
                    <th className="sac-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <tr key={c.id} className={`sac-row${on ? ' sac-row--on' : ''}`} onClick={() => openDetail(c.id)}>
                        <td className="sac-td" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="sac-cb"
                            checked={on}
                            onChange={() => toggleSel(c.id)}
                            aria-label={`Select ${c.name}`}
                          />
                        </td>
                        <td className="sac-td">
                          <div className="flex items-center gap-3">
                            <span className="sac-av">{initialsOf(c.name)}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 text-[13px] flex items-center gap-1.5 max-w-[210px]">
                                {nameLine(c)}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[210px]">{c.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="sac-td">{educationCell(c)}</td>
                        <td className="sac-td">{locationCell(c)}</td>
                        <td className="sac-td">
                          <ProfilePill complete={c.profileComplete} />
                        </td>
                        <td className="sac-td text-right">{appsCell(c)}</td>
                        <td className="sac-td">{latestCell(c)}</td>
                        <td className="sac-td whitespace-nowrap text-slate-600">{loginCell(c)}</td>
                        <td className="sac-td whitespace-nowrap text-slate-600">{formatDate(c.registeredAt)}</td>
                        <td className="sac-td text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Link href={detailHref(c.id)} className="sac-btn h-8">
                            View
                          </Link>{' '}
                          <button
                            type="button"
                            className="sac-btn sac-btn--icon"
                            data-sac-menu
                            onClick={(e) => openRowMenu(e, c)}
                            aria-label={`More actions for ${c.name}`}
                            aria-haspopup="menu"
                          >
                            <MoreHorizontal className="w-4 h-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {rows.map((c) => {
                const on = selected.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`sac-arow${on ? ' ring-1 ring-indigo-300' : ''}`}
                    onClick={() => openDetail(c.id)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="sac-cb mt-2.5"
                        checked={on}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSel(c.id)}
                        aria-label={`Select ${c.name}`}
                      />
                      <span className="sac-av">{initialsOf(c.name)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 text-[14px] flex items-center gap-1.5">{nameLine(c)}</div>
                        <div className="text-[12px] text-slate-500 truncate">{c.email}</div>
                        <div className="text-[12px] text-slate-600 mt-1 truncate">
                          {[c.degree, c.college, c.city].filter(Boolean).join(' · ') || 'Profile not filled in yet'}
                        </div>
                      </div>
                      <ProfilePill complete={c.profileComplete} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 text-[12px]">
                      <div>
                        <div className="sac-lbl mb-1">Applications</div>
                        {appsCell(c)}
                      </div>
                      <div>
                        <div className="sac-lbl mb-1">Last login</div>
                        <div className="text-slate-700">{loginCell(c)}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="sac-lbl mb-1">Latest application</div>
                        {latestCell(c)}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                      <Link href={detailHref(c.id)} className="sac-btn h-8">
                        View
                      </Link>
                      <button
                        type="button"
                        className="sac-btn sac-btn--icon"
                        data-sac-menu
                        onClick={(e) => openRowMenu(e, c)}
                        aria-label={`More actions for ${c.name}`}
                      >
                        <MoreHorizontal className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="sac-empty border border-dashed border-slate-200 rounded-[12px]">
            <span className="sac-eicon">
              <SearchX className="w-6 h-6" aria-hidden />
            </span>
            <div className="font-bold text-slate-900 text-[14px]">
              {noResultsCompanyOnly
                ? `No candidates have applied to ${activeCompany.name} yet`
                : 'No candidates match these filters'}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">Try removing a filter or searching for something else.</div>
            <button type="button" className="sac-btn mt-4" onClick={clearAll}>
              Clear all filters
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[12px] text-slate-500">
            {filtered.length ? `Showing ${start}–${start + rows.length - 1} of ${filtered.length}` : '0 results'}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="sac-sel w-auto"
              value={S.size}
              onChange={(e) => update({ size: Number(e.target.value) })}
              aria-label="Rows per page"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
            <div className="flex gap-1">
              <button
                type="button"
                className="sac-pg"
                disabled={page <= 1}
                onClick={() => goPage(page - 1)}
                aria-label="Previous page"
              >
                ‹
              </button>
              {Array.from({ length: pages }, (_, k) => k + 1).map((i) => {
                if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`sac-pg${i === page ? ' sac-pg--on' : ''}`}
                      onClick={() => goPage(i)}
                      aria-current={i === page ? 'page' : undefined}
                    >
                      {i}
                    </button>
                  );
                }
                if (Math.abs(i - page) === 2) {
                  return (
                    <span key={i} className="sac-pg sac-pg--gap">
                      …
                    </span>
                  );
                }
                return null;
              })}
              <button
                type="button"
                className="sac-pg"
                disabled={page >= pages}
                onClick={() => goPage(page + 1)}
                aria-label="Next page"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {menu ? (
        <div
          className="sac-menu fixed z-[65] w-44"
          role="menu"
          data-sac-menu
          style={{ left: menu.left, top: menu.top }}
        >
          <button type="button" role="menuitem" className="sac-mi" onClick={() => openDetail(menu.c.id)}>
            <Eye className="w-4 h-4 text-slate-400" aria-hidden />
            Open details
          </button>
          <button
            type="button"
            role="menuitem"
            className="sac-mi"
            onClick={() => {
              setMenu(null);
              copyEmail(menu.c);
            }}
          >
            <Copy className="w-4 h-4 text-slate-400" aria-hidden />
            Copy email
          </button>
          <button
            type="button"
            role="menuitem"
            className="sac-mi"
            onClick={() => {
              setMenu(null);
              viewCv(menu.c);
            }}
          >
            <FileText className="w-4 h-4 text-slate-400" aria-hidden />
            View CV
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            role="menuitem"
            className="sac-mi"
            onClick={() => {
              setMenu(null);
              adjustPoints(menu.c);
            }}
          >
            <Coins className="w-4 h-4 text-slate-400" aria-hidden />
            Adjust points
          </button>
        </div>
      ) : null}

      <div className="sac-toasts" aria-live="polite">
        {toasts.map((t) => (
          <IpToastItem
            key={t.id}
            message={t.msg}
            onDismiss={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className="sac-toast"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
            <span>{t.msg}</span>
          </IpToastItem>
        ))}
      </div>
    </div>
  );
}
