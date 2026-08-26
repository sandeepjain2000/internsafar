'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Search, SlidersHorizontal } from 'lucide-react';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useViewMode } from '@/hooks/useViewMode';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import ScoreInsightBar, { MatchValidationPair } from '@/components/ip/ScoreInsightBar';
import { useClientPagination } from '@/hooks/useClientPagination';
import IpTablePagination from '@/components/ip/IpTablePagination';
import '@/components/ip/ip-browse-internships-gemini.css';

const PAGE_SIZE = 10;

const QUICK_CHIPS = [
  { id: 'starting-soon', label: 'Starting soon' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'verified', label: 'Verified employers' },
];

function modeKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]/g, '');
}

function matchesWorkMode(itemMode, filterMode) {
  if (!filterMode || filterMode === 'all') return true;
  const a = modeKey(itemMode);
  const b = modeKey(filterMode);
  if (a === b) return true;
  return (a === 'onsite' || a === 'onsiteonly') && (b === 'onsite' || b === 'onsiteonly');
}

function matchesLocation(item, selectedCities) {
  if (!selectedCities?.length) return true;
  const wants = selectedCities.map((c) => String(c).trim().toLowerCase()).filter(Boolean);
  if (!wants.length) return true;
  if (wants.includes('remote') && modeKey(item.work_mode) === 'remote') return true;
  if (modeKey(item.work_mode) === 'remote') return true;
  const cities = [];
  if (Array.isArray(item.locations)) {
    for (const c of item.locations) {
      const s = String(c || '').trim().toLowerCase();
      if (s) cities.push(s);
    }
  }
  const single = String(item.location || '').trim().toLowerCase();
  if (single) cities.push(single);
  return wants.some((w) => cities.some((c) => c === w || c.includes(w)));
}

function matchesQuery(item, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    item.title,
    item.company_name,
    item.location,
    item.work_mode,
    ...(item.skill_tags || []),
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  return hay.includes(needle);
}

function matchesChip(item, chip) {
  if (!chip) return true;
  if (chip === 'starting-soon') {
    const start = item.start_date || item.starts_at;
    if (!start) return false;
    const t = new Date(start).getTime();
    if (Number.isNaN(t)) return false;
    const now = Date.now();
    return t >= now && t <= now + 21 * 86400000;
  }
  if (chip === 'recent') {
    const t = new Date(item.updated_at || item.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t <= 7 * 86400000;
  }
  if (chip === 'verified') return Boolean(item.employer_verified);
  return true;
}

function sortCatalog(items, sort) {
  const copy = [...items];
  if (sort === 'best-match') {
    copy.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
  } else if (sort === 'highest-stipend') {
    copy.sort((a, b) => Number(b.stipend_inr || 0) - Number(a.stipend_inr || 0));
  } else if (sort === 'earliest-start' || sort === 'availability') {
    copy.sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : Number.POSITIVE_INFINITY;
      const db = b.start_date ? new Date(b.start_date).getTime() : Number.POSITIVE_INFINITY;
      return da - db;
    });
  } else if (sort === 'fewest-applicants' || sort === 'best-odds') {
    copy.sort((a, b) => Number(a.applicant_count ?? a._sortApplicants ?? 0) - Number(b.applicant_count ?? b._sortApplicants ?? 0));
  } else {
    copy.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }
  return copy;
}

const WORK_MODES = [
  { value: 'all', label: 'All Modes' },
  { value: 'Remote', label: 'Remote Only' },
  { value: 'Hybrid', label: 'Hybrid Only' },
  { value: 'On-site', label: 'On-site Only' },
];

const STIPEND_OPTIONS = [
  { value: '0', label: 'Any Stipend' },
  { value: '15000', label: '₹15,000 / mo or more' },
  { value: '18000', label: '₹18,000 / mo or more' },
  { value: '20000', label: '₹20,000 / mo or more' },
];

const MATCH_OPTIONS = [
  { value: '0', label: 'All Match Scores' },
  { value: '85', label: '85%+ Match Score' },
  { value: '90', label: '90%+ Match Score' },
];

const CITY_PRESETS = [
  'Bengaluru',
  'Mumbai',
  'Pune',
  'Hyderabad',
  'Chennai',
  'Delhi',
  'Remote',
];

const SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match Score' },
  { value: 'highest-stipend', label: 'Highest Stipend' },
  { value: 'newest', label: 'Newest Listed' },
  { value: 'earliest-start', label: 'Earliest Start Date' },
  { value: 'fewest-applicants', label: 'Fewest Applicants (Best Odds)' },
];

function stipendLabel(i) {
  if (i.stipend_inr) return `₹${Number(i.stipend_inr).toLocaleString('en-IN')}/mo`;
  if (i.stipend_type === 'incentive') return 'Incentive';
  return 'Unpaid';
}

function durationLabel(i) {
  if (i.duration_months) return `${i.duration_months} month${Number(i.duration_months) === 1 ? '' : 's'}`;
  return 'Duration not listed';
}

function startLabel(i) {
  if (!i.start_date) return 'Flexible start';
  const d = new Date(i.start_date);
  if (Number.isNaN(d.getTime())) return 'Flexible start';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function companyInitials(name) {
  if (!name || name === 'Confidential employer') return 'CE';
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || 'IN';
}

export default function BrowseInternshipsPage() {
  const router = useRouter();
  const [catalog, setCatalog] = useState([]);
  const [counts, setCounts] = useState({ all: 0, saved: 0, recommended: 0 });
  const [q, setQ] = useState('');
  const [minStipend, setMinStipend] = useState('0');
  const [workMode, setWorkMode] = useState('all');
  const [selectedCities, setSelectedCities] = useState([]);
  const [availableCities, setAvailableCities] = useState(CITY_PRESETS);
  const [minMatch, setMinMatch] = useState('0');
  const [minValidation, setMinValidation] = useState('');
  const [sort, setSort] = useState('best-match');
  const [tab, setTab] = useState('all');
  const [chip, setChip] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [viewMode, setViewMode] = useViewMode('ip_browse_view', 'cards');
  const reqRef = useRef(0);

  const snapshot = useMemo(() => ({
    filters: {
      q, minStipend, workMode, selectedCities, minMatch, minValidation, tab, chip,
    },
    sort,
  }), [q, minStipend, workMode, selectedCities, minMatch, minValidation, tab, chip, sort]);
  const prefs = useListPrefsSync({
    tableKey: 'candidate.internships',
    snapshot,
    applySnapshot: (s) => {
      const f = s?.filters || {};
      setQ(f.q != null ? String(f.q) : '');
      setMinStipend(f.minStipend != null ? String(f.minStipend) : '0');
      setWorkMode(f.workMode != null ? String(f.workMode) : 'all');
      setSelectedCities(Array.isArray(f.selectedCities) ? f.selectedCities.map(String) : []);
      setMinMatch(f.minMatch != null ? String(f.minMatch) : '0');
      setMinValidation(f.minValidation != null ? String(f.minValidation) : '');
      let nextTab = f.tab != null ? String(f.tab) : 'all';
      let nextChip = f.chip != null ? String(f.chip) : '';
      // Legacy presets used chip=saved; Saved is a top tab now.
      if (nextChip === 'saved') {
        nextTab = 'saved';
        nextChip = '';
      }
      if (nextChip === '') nextChip = '';
      else if (!QUICK_CHIPS.some((c) => c.id === nextChip)) nextChip = '';
      setTab(nextTab || 'all');
      setChip(nextChip);
      setSort(s?.sort != null && s.sort !== '' ? String(s.sort) : 'best-match');
    },
  });

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('saved') === '1') setTab('saved');
    } catch {
      /* ignore */
    }
    fetch('/api/ip/ref/cities')
      .then((r) => r.json())
      .then((d) => setCityOptions(d.items || []))
      .catch(() => {});
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => setPoints(d.profile?.points ?? null))
      .catch(() => {});
  }, []);

  async function loadCatalog() {
    const id = ++reqRef.current;
    setLoading(true);
    try {
      const res = await fetch('/api/ip/candidate/internships?catalog=1');
      const data = await res.json().catch(() => ({}));
      if (id !== reqRef.current) return;
      setCatalog(Array.isArray(data.items) ? data.items : []);
      if (data.counts) setCounts(data.counts);
      if (Array.isArray(data.availableCities) && data.availableCities.length) {
        const merged = new Map();
        for (const c of [...CITY_PRESETS, ...data.availableCities]) {
          const key = String(c).toLowerCase();
          if (!merged.has(key)) merged.set(key, c);
        }
        setAvailableCities([...merged.values()].sort((a, b) => a.localeCompare(b)));
      }
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!prefs.ready) return;
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.ready]);

  async function toggleSave(internshipId, saved) {
    const nextSaved = !saved;
    setCatalog((prev) => prev.map((i) => (i.id === internshipId ? { ...i, saved: nextSaved } : i)));
    setCounts((prev) => ({
      ...prev,
      saved: Math.max(0, (prev.saved || 0) + (nextSaved ? 1 : -1)),
    }));
    try {
      await fetch('/api/ip/candidate/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internshipId, saved: nextSaved }),
      });
    } catch {
      setCatalog((prev) => prev.map((i) => (i.id === internshipId ? { ...i, saved } : i)));
      setCounts((prev) => ({
        ...prev,
        saved: Math.max(0, (prev.saved || 0) + (saved ? 1 : -1)),
      }));
    }
  }

  const items = useMemo(() => {
    const stipendFloor = Number(minStipend) || 0;
    const matchFloor = Number(minMatch) || 0;
    const validationFloor = Number(minValidation) || 0;
    const effectiveMatch = tab === 'recommended' ? Math.max(matchFloor, 85) : matchFloor;

    let rows = catalog.filter((i) => {
      if (tab === 'saved' && !i.saved) return false;
      // Non-saved tabs: marketplace-visible only (closed/expired saved extras stay under Saved).
      if (tab !== 'saved' && i.in_marketplace === false) return false;
      if (!matchesQuery(i, q)) return false;
      if (stipendFloor && Number(i.stipend_inr || 0) < stipendFloor) return false;
      if (!matchesWorkMode(i.work_mode, workMode)) return false;
      if (!matchesLocation(i, selectedCities)) return false;
      if (effectiveMatch && (i.match_score ?? 0) < effectiveMatch) return false;
      if (validationFloor && (i.validation_score ?? 0) < validationFloor) return false;
      if (!matchesChip(i, chip)) return false;
      return true;
    });

    rows = sortCatalog(rows, sort);
    if (tab === 'recommended') rows = rows.slice(0, 12);
    return rows;
  }, [catalog, q, minStipend, workMode, selectedCities, minMatch, minValidation, sort, tab, chip]);

  const liveCounts = useMemo(() => {
    const visible = catalog.filter((i) => i.in_marketplace !== false);
    return {
      all: counts.all || visible.length,
      saved: catalog.filter((i) => i.saved).length,
      recommended: counts.recommended || visible.filter((i) => (i.match_score ?? 0) >= 85).length,
    };
  }, [catalog, counts]);

  const { page, setPage, totalPages, total, pageItems, pageSize } = useClientPagination(items, PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [q, minStipend, workMode, selectedCities, minMatch, minValidation, sort, tab, chip, setPage]);

  function resetFilters() {
    setQ('');
    setMinStipend('0');
    setWorkMode('all');
    setSelectedCities([]);
    setMinMatch('0');
    setMinValidation('');
    setSort('best-match');
    setTab('all');
    setChip('');
    setFiltersOpen(false);
  }

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (Number(minStipend) > 0) n += 1;
    if (workMode !== 'all') n += 1;
    if (selectedCities.length > 0) n += 1;
    if (Number(minMatch) > 0) n += 1;
    if (minValidation) n += 1;
    return n;
  }, [minStipend, workMode, selectedCities, minMatch, minValidation]);

  const locationFilterOptions = useMemo(() => {
    const map = new Map();
    for (const o of cityOptions) {
      const v = o?.value || o?.city || o;
      if (v == null || v === '') continue;
      map.set(String(v).toLowerCase(), typeof o === 'object' && o.value != null ? o : { value: v, label: String(v) });
    }
    for (const c of availableCities) {
      const key = String(c).toLowerCase();
      if (!map.has(key)) map.set(key, { value: c, label: c });
    }
    if (!map.size) return CITY_PRESETS.map((c) => ({ value: c, label: c }));
    return [...map.values()];
  }, [cityOptions, availableCities]);

  const pointsLabel = points == null ? '—' : `${points} Pts Available`;

  return (
    <div className="ip-browse">
      <div className="ip-br-hero">
        <div>
          <div className="ip-br-hero__title">
            <h1>Browse Internships</h1>
            <span className="ip-br-chip">Marketplace</span>
            <button
              type="button"
              className="ip-br-m-saved"
              title="Saved internships"
              aria-label={`Saved internships (${liveCounts.saved})`}
              onClick={() => setTab('saved')}
            >
              <Bookmark fill={tab === 'saved' ? 'currentColor' : 'none'} />
              {liveCounts.saved > 0 ? <span>{liveCounts.saved}</span> : null}
            </button>
          </div>
          <p className="ip-br-hero__desk">Discover verified internship opportunities. Submitting an application uses {POINTS_PER_APPLICATION} points.</p>
          <p className="ip-br-hero__mob">Explore {liveCounts.all} openings · {POINTS_PER_APPLICATION} pts per application · {pointsLabel}</p>
        </div>
        <div className="ip-br-cost">
          <div className="ip-br-cost__icon" aria-hidden>{POINTS_PER_APPLICATION}</div>
          <div>
            <span>Application Cost</span>
            <p>{POINTS_PER_APPLICATION} points / submission • <strong>{pointsLabel}</strong></p>
          </div>
        </div>
      </div>

      <div className="ip-br-toolbar">
        <div className="ip-br-toolbar__row">
          <div className="ip-br-search">
            <Search />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by role title, company name, skills (e.g. React, Python), or location..."
              aria-label="Search internships"
            />
            {q ? (
              <button type="button" className="ip-br-search-clear" onClick={() => setQ('')} aria-label="Clear search">
                ×
              </button>
            ) : null}
          </div>
          <div className="ip-br-toolbar__actions">
            <button
              type="button"
              className={`ip-br-btn ip-br-btn--ghost${filtersOpen || activeFilterCount > 0 ? ' is-on' : ''}`}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal />
              <span className="ip-br-filter-desk">Filter Options</span>
              <span className="ip-br-filter-mob">Filters</span>
              {activeFilterCount > 0 ? (
                <span className="ip-br-filter-count" aria-label={`${activeFilterCount} filters active`}>
                  {activeFilterCount}
                </span>
              ) : null}
            </button>
            <button type="button" className="ip-br-btn ip-br-btn--ghost" onClick={resetFilters}>
              Reset filters
            </button>
            <label className="ip-br-sort">
              <span>Sort:</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <ListPresetsBar {...prefs} />
        </div>

        {filtersOpen ? (
          <>
          <button type="button" className="ip-br-sheet-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <div className="ip-br-drawer" role="dialog" aria-label="Filter internships">
            <div className="ip-br-sheet-handle" aria-hidden />
            <div className="ip-br-sheet-head">
              <h3>Filter Internships</h3>
              <button type="button" className="ip-br-sheet-x" onClick={() => setFiltersOpen(false)} aria-label="Close filters">×</button>
            </div>
            <label>
              Work Mode
              <select value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label>
              Minimum Monthly Stipend
              <select value={minStipend} onChange={(e) => setMinStipend(e.target.value)}>
                {STIPEND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ip-br-city-filter">
              Work location (city)
              <span className="ip-br-city-hint">Searchable multi-select of work cities (separate from screening questions).</span>
              <SearchableMultiSelect
                options={locationFilterOptions}
                value={selectedCities}
                onChange={setSelectedCities}
                placeholder="Type to search cities…"
                ariaLabel="Work location cities"
              />
            </label>
            <label>
              Candidate Match %
              <select value={minMatch} onChange={(e) => setMinMatch(e.target.value)}>
                {MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Min Validation Score
              <input
                type="number"
                min="0"
                max="100"
                value={minValidation}
                onChange={(e) => setMinValidation(e.target.value)}
                placeholder="Any"
              />
            </label>
            <div className="ip-br-sheet-actions">
              <button type="button" className="ip-br-btn ip-br-btn--ghost" onClick={resetFilters}>Clear All</button>
              <button type="button" className="ip-br-btn ip-br-btn--primary" onClick={() => setFiltersOpen(false)}>Apply Filters</button>
            </div>
          </div>
          </>
        ) : null}

        <div className="ip-br-tabs">
          <div className="ip-br-tabs__list">
            <button type="button" className={tab === 'all' ? 'is-on' : undefined} onClick={() => setTab('all')}>
              All Internships ({liveCounts.all})
            </button>
            <button type="button" className={tab === 'saved' ? 'is-on' : undefined} onClick={() => setTab('saved')}>
              <Bookmark fill="currentColor" />
              Saved Internships ({liveCounts.saved})
            </button>
            <button type="button" className={tab === 'recommended' ? 'is-on' : undefined} onClick={() => setTab('recommended')}>
              Recommended for You
            </button>
          </div>
          <button type="button" className="ip-br-reset" onClick={resetFilters}>Reset All Filters</button>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        <div className="ip-br-chips" role="tablist" aria-label="Quick filters">
          {QUICK_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`ip-br-qchip${chip === c.id ? ' is-on' : ''}`}
              onClick={() => setChip((prev) => (prev === c.id ? '' : c.id))}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ip-br-mcount">
        <span><b>{loading ? '…' : items.length}</b> roles matching</span>
        <label className="ip-br-sort">
          <span>Sort by:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort internships">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {items.length ? (
        viewMode === 'list' ? (
          <div className="ip-ph-list-wrap">
            <table className="ip-ph-list">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Employer</th>
                  <th>Stipend</th>
                  <th>Start Date</th>
                  <th>Duration</th>
                  <th>Work Mode / Location</th>
                  <th>Status</th>
                  <th>Match</th>
                  <th>Validation</th>
                  <th>Actions</th>
                  <th aria-label="Open detail" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button type="button" className="ip-ph-role" onClick={() => router.push(`/candidate/internships/${i.id}`)}>
                        {i.title}
                      </button>
                      {i.lifecycle_label && i.lifecycle_label !== 'Live' ? (
                        <span className="ml-2 text-xs text-slate-500">{i.lifecycle_label}</span>
                      ) : null}
                    </td>
                    <td>
                      {i.company_name}
                      {i.employer_verified ? <span className="ml-1 text-xs text-indigo-600">Verified</span> : null}
                    </td>
                    <td>{stipendLabel(i)}</td>
                    <td>{startLabel(i)}</td>
                    <td>{durationLabel(i)}</td>
                    <td>{[i.work_mode, i.location].filter(Boolean).join(' • ') || '—'}</td>
                    <td>{i.applied ? 'Applied' : 'Open'}</td>
                    <td>
                      <ScoreInsightBar
                        kind="match"
                        score={i.match_score}
                        size="compact"
                        matchDetail={i.match_detail}
                      />
                    </td>
                    <td>
                      <ScoreInsightBar
                        kind="validation"
                        score={i.validation_score}
                        size="compact"
                        breakdown={i.validation_breakdown}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`ip-br-bookmark ip-br-bookmark--list${i.saved ? ' is-on' : ''}`}
                        title={i.saved ? 'Unsave internship' : 'Save internship'}
                        aria-label={i.saved ? 'Unsave' : 'Save'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSave(i.id, i.saved);
                        }}
                      >
                        <Bookmark fill={i.saved ? 'currentColor' : 'none'} />
                        <span>{i.saved ? 'Saved' : 'Save'}</span>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ip-ph-role"
                        title="View internship details"
                        aria-label={`View details for ${i.title}`}
                        onClick={() => router.push(`/candidate/internships/${i.id}`)}
                      >
                        →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="ip-br-grid">
          {pageItems.map((i) => (
            <article key={i.id} className="ip-br-card">
              <div className="ip-br-card__top">
                <div className="ip-br-card__who">
                  <div className={`ip-br-avatar${i.company_name === 'Confidential employer' ? ' is-secret' : ''}`}>
                    {companyInitials(i.company_name)}
                  </div>
                  <div>
                    <h2>
                      <button type="button" onClick={() => router.push(`/candidate/internships/${i.id}`)}>
                        {i.title}
                      </button>
                    </h2>
                    <p>
                      {i.company_name}
                      {i.employer_verified ? <span className="ip-br-verified">Verified employer</span> : null}
                      {i.lifecycle_label && i.lifecycle_label !== 'Live' ? (
                        <span className="ip-br-verified" style={{ marginLeft: 6 }}>{i.lifecycle_label}</span>
                      ) : null}
                    </p>
                    {i.company_name !== 'Confidential employer' ? (
                      <p className="ip-br-emp-line">
                        {[i.employer_industry, i.employer_hq_city, i.employer_company_size].filter(Boolean).join(' · ') || 'Employer on this listing'}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={`ip-br-bookmark${i.saved ? ' is-on' : ''}`}
                  title={i.saved ? 'Unsave' : 'Save'}
                  aria-label={i.saved ? 'Unsave' : 'Save'}
                  onClick={() => toggleSave(i.id, i.saved)}
                >
                  <Bookmark fill={i.saved ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div className="ip-br-facts">
                <div>
                  <span>Employer</span>
                  <b>{i.company_name}</b>
                </div>
                <div>
                  <span>Starts</span>
                  <b>{startLabel(i)}</b>
                </div>
                <div>
                  <span>Duration</span>
                  <b>{durationLabel(i)}</b>
                </div>
                <div>
                  <span>Work</span>
                  <b>{[i.work_mode, i.location].filter(Boolean).join(' · ') || '—'}</b>
                </div>
              </div>

              <div className="ip-br-meta">
                <MatchValidationPair
                  matchScore={i.match_score}
                  validationScore={i.validation_score}
                  matchDetail={i.match_detail}
                  validationBreakdown={i.validation_breakdown}
                  size="comfortable"
                />
                <span>{[i.work_mode, i.location].filter(Boolean).join(' • ') || '—'}</span>
                {i.application_volume_label ? (
                  <span title="Application volume range">{i.application_volume_label} applications</span>
                ) : null}
              </div>

              {i.skill_tags?.length ? (
                <div className="ip-br-tags">
                  {i.skill_tags.slice(0, 6).map((s) => <span key={s}>{s}</span>)}
                </div>
              ) : null}

              <div className="ip-br-card__foot">
                <div>
                  <span className="ip-br-stipend-label">Stipend</span>
                  <strong>{stipendLabel(i)}</strong>
                </div>
                <div className="ip-br-card__cta">
                  {i.applied ? (
                    <span className="ip-br-applied">Applied</span>
                  ) : (
                    <button
                      type="button"
                      className="ip-br-btn ip-br-btn--primary"
                      onClick={() => router.push(`/candidate/internships/${i.id}`)}
                    >
                      <span className="ip-br-cta-desk">Review &amp; Apply ({POINTS_PER_APPLICATION} Pts)</span>
                      <span className="ip-br-cta-mob">View &amp; Apply</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
        )
      ) : !loading ? (
        <div className="ip-br-empty">
          <div className="ip-br-empty__icon" aria-hidden>
            <Search />
          </div>
          <h3>No matching internships found</h3>
          <p>We couldn&apos;t find any opportunities matching your current search or filter criteria.</p>
          <div className="ip-br-empty__tips">
            <strong>Suggestions to find more roles:</strong>
            <ul>
              <li>Try broadening your keyword search terms</li>
              <li>Switch Work Mode to &quot;All Modes&quot;</li>
              <li>Lower the minimum stipend threshold</li>
              <li>Clear active search filters</li>
            </ul>
          </div>
          <button type="button" className="ip-br-btn ip-br-btn--primary" onClick={resetFilters}>
            Reset All Filters &amp; Search
          </button>
        </div>
      ) : (
        <p className="ip-br-loading">Loading internships…</p>
      )}

      {!loading && total > 0 ? (
        <IpTablePagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
