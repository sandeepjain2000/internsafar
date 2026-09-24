'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Search, SlidersHorizontal, Star } from 'lucide-react';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useViewMode } from '@/hooks/useViewMode';
import { useClientPagination } from '@/hooks/useClientPagination';
import useIpCityCatalog from '@/hooks/useIpCityCatalog';
import useIpCountryCatalog from '@/hooks/useIpCountryCatalog';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import ValidationScoreButton from '@/components/ip/ValidationScoreButton';
import IpListPager from '@/components/ip/IpListPager';
import '@/components/ip/ip-browse-internships-gemini.css';
import '@/components/ip/ip-list-pager.css';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';

const PAGE_SIZE = 10;

const QUICK_CHIPS = [
  { id: 'unapplied', label: 'Unapplied' },
  { id: '', label: 'All listings' },
  { id: 'starting-soon', label: 'Starting soon' },
  { id: 'saved', label: 'Saved' },
  { id: 'recent', label: 'Recently updated' },
  { id: 'verified', label: 'Verified employers' },
];

const WORK_MODES = [
  { value: 'all', label: 'All Modes' },
  { value: 'Remote', label: 'Remote Only' },
  { value: 'Hybrid', label: 'Hybrid Only' },
  { value: 'On-site', label: 'On-site Only' },
];

const START_DATE_OPTIONS = [
  { value: 'any', label: 'Any start date' },
  { value: 'next-30', label: 'Starts within 30 days' },
  { value: 'flexible', label: 'Flexible / not specified' },
];

const STIPEND_OPTIONS = [
  { value: '0', label: 'Any Stipend' },
  { value: 'unpaid', label: 'Unpaid / not specified' },
  { value: '15000', label: '₹15,000 / mo or more' },
  { value: '18000', label: '₹18,000 / mo or more' },
  { value: '20000', label: '₹20,000 / mo or more' },
];

const DURATION_OPTIONS = [
  { value: '0', label: 'Any duration' },
  { value: '1', label: 'Up to 1 month' },
  { value: '2', label: 'Up to 2 months' },
  { value: '3', label: 'Up to 3 months' },
  { value: '6', label: 'Up to 6 months' },
];

const MATCH_OPTIONS = [
  { value: '0', label: 'All Match Scores' },
  { value: '85', label: '85%+ Match Score' },
  { value: '90', label: '90%+ Match Score' },
];

const SORT_OPTIONS = [
  { value: 'best-match', label: 'Best Match Score' },
  { value: 'highest-stipend', label: 'Highest Stipend' },
  { value: 'newest', label: 'Newest Listed' },
  { value: 'earliest-start', label: 'Earliest Start Date' },
  { value: 'fewest-applicants', label: 'Fewest Applicants (Best Odds)' },
];

function stipendLabel(i) {
  return formatInternshipStipend(i, { unpaidLabel: 'Unpaid' }) || 'Unpaid';
}

function durationLabel(i) {
  if (i.duration_months) return `${i.duration_months} month${Number(i.duration_months) === 1 ? '' : 's'}`;
  return '-';
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
  const { placeCityOptions, cityOptions: catalogCities, loading: citiesLoading } = useIpCityCatalog();
  const { countryOptions, loading: countriesLoading } = useIpCountryCatalog();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, saved: 0, recommended: 0 });
  const [q, setQ] = useState('');
  const [minStipend, setMinStipend] = useState('0');
  const [maxDuration, setMaxDuration] = useState('0');
  const [workMode, setWorkMode] = useState('all');
  const [startDate, setStartDate] = useState('any');
  const [selectedCities, setSelectedCities] = useState([]);
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [minMatch, setMinMatch] = useState('0');
  const [minValidation, setMinValidation] = useState('');
  const [sort, setSort] = useState('best-match');
  const [tab, setTab] = useState('all');
  const [chip, setChip] = useState('unapplied');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(null);
  const [viewMode, setViewMode] = useViewMode('ip_browse_view', 'cards');
  const [presetResetKey, setPresetResetKey] = useState(0);
  const reqRef = useRef(0);
  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(items, PAGE_SIZE);

  const snapshot = useMemo(() => ({
    filters: {
      q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, tab, chip,
    },
    sort,
  }), [q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, tab, chip, sort]);
  const prefs = useListPrefsSync({
    tableKey: 'candidate.internships',
    snapshot,
    applySnapshot: (s) => {
      const f = s.filters || {};
      if (f.q != null) setQ(f.q);
      if (f.minStipend != null) setMinStipend(String(f.minStipend));
      if (f.maxDuration != null) setMaxDuration(String(f.maxDuration));
      if (f.workMode != null) setWorkMode(f.workMode);
      if (f.startDate != null) setStartDate(f.startDate);
      if (Array.isArray(f.selectedRegions)) setSelectedRegions(f.selectedRegions);
      if (Array.isArray(f.selectedCities)) setSelectedCities(f.selectedCities);
      if (f.minMatch != null) setMinMatch(String(f.minMatch));
      if (f.minValidation != null) setMinValidation(f.minValidation);
      if (f.tab != null) setTab(f.tab);
      if (f.chip != null) setChip(f.chip);
      if (s.sort) setSort(s.sort);
    },
  });

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('saved') === '1') setTab('saved');
    } catch {
      /* ignore */
    }
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => setPoints(d.profile?.points ?? null))
      .catch(() => {});
  }, []);

  async function load(next = {}) {
    const nextQ = next.q !== undefined ? next.q : q;
    const nextStipend = next.minStipend !== undefined ? next.minStipend : minStipend;
    const nextDuration = next.maxDuration !== undefined ? next.maxDuration : maxDuration;
    const nextMode = next.workMode !== undefined ? next.workMode : workMode;
    const nextStart = next.startDate !== undefined ? next.startDate : startDate;
    const nextCities = next.selectedCities !== undefined ? next.selectedCities : selectedCities;
    const nextRegions = next.selectedRegions !== undefined ? next.selectedRegions : selectedRegions;
    const nextMatch = next.minMatch !== undefined ? next.minMatch : minMatch;
    const nextValid = next.minValidation !== undefined ? next.minValidation : minValidation;
    const nextSort = next.sort !== undefined ? next.sort : sort;
    const nextTab = next.tab !== undefined ? next.tab : tab;
    const nextChip = next.chip !== undefined ? next.chip : chip;

    const id = ++reqRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    if (nextStipend === 'unpaid') params.set('stipendType', 'unpaid');
    else if (Number(nextStipend)) params.set('minStipend', nextStipend);
    if (Number(nextDuration)) params.set('maxDuration', nextDuration);
    if (nextMode && nextMode !== 'all') params.set('workMode', nextMode);
    if (nextStart && nextStart !== 'any') params.set('startDate', nextStart);
    if (nextCities?.length) params.set('location', nextCities.join(','));
    if (nextRegions?.length) params.set('region', nextRegions.join(','));
    if (Number(nextMatch)) params.set('minMatch', nextMatch);
    if (nextValid) params.set('minValidation', nextValid);
    params.set('sort', nextSort);
    if (nextTab === 'saved') params.set('savedOnly', '1');
    if (nextTab === 'recommended') params.set('minMatch', String(Math.max(Number(nextMatch) || 0, 85)));
    if (nextChip) params.set('chip', nextChip);
    const res = await fetch(`/api/ip/candidate/internships?${params.toString()}`);
    const data = await res.json();
    if (id !== reqRef.current) return;
    setItems(data.items || []);
    if (data.counts) setCounts(data.counts);
    setLoading(false);
  }

  useEffect(() => {
    if (!prefs.ready) return undefined;
    const t = setTimeout(() => {
      load();
    }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.ready, q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort, tab, chip]);

  useEffect(() => {
    setPage(1);
  }, [q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort, tab, chip, setPage]);

  async function toggleSave(internshipId, saved) {
    await fetch('/api/ip/candidate/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internshipId, saved: !saved }),
    });
    await load();
  }

  function resetFilters() {
    setQ('');
    setMinStipend('0');
    setMaxDuration('0');
    setWorkMode('all');
    setStartDate('any');
    setSelectedRegions([]);
    setSelectedCities([]);
    setMinMatch('0');
    setMinValidation('');
    setSort('best-match');
    setTab('all');
    setChip('unapplied');
    setFiltersOpen(false);
    setPresetResetKey((k) => k + 1);
  }

  const filtersActiveCount = useMemo(() => {
    let n = 0;
    if (minStipend !== '0') n += 1;
    if (Number(maxDuration) > 0) n += 1;
    if (workMode !== 'all') n += 1;
    if (startDate !== 'any') n += 1;
    if (selectedRegions.length > 0) n += 1;
    if (selectedCities.length > 0) n += 1;
    if (Number(minMatch) > 0) n += 1;
    if (Boolean(minValidation)) n += 1;
    return n;
  }, [minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation]);

  const browseCityOptions = useMemo(() => {
    const remote = (catalogCities || []).filter((o) => /^remote$/i.test(String(o.value || o.city || '')));
    const places = placeCityOptions || [];
    const seen = new Set(places.map((o) => String(o.value).toLowerCase()));
    const extra = remote.filter((o) => !seen.has(String(o.value).toLowerCase()));
    return [...places, ...extra];
  }, [placeCityOptions, catalogCities]);

  const pointsLabel = points == null ? '—' : `${points} Pts Available`;

  return (
    <div className="ip-browse">
      <div className="ip-br-hero">
        <div>
          <div className="ip-br-hero__title">
            <h1>Browse Internships</h1>
            <span className="ip-br-chip ip-br-chip--desk">Marketplace</span>
            <span className="ip-br-chip ip-br-chip--mob">{loading ? '…' : counts.all} open</span>
            <button
              type="button"
              className="ip-br-m-saved"
              title="Saved internships"
              aria-label={`Saved internships (${counts.saved})`}
              onClick={() => setTab('saved')}
            >
              <Bookmark fill={tab === 'saved' ? 'currentColor' : 'none'} />
              {counts.saved > 0 ? <span>{counts.saved}</span> : null}
            </button>
          </div>
          <p className="ip-br-hero__desk">Discover verified internship opportunities. Submitting an application uses {POINTS_PER_APPLICATION} points.</p>
          <p className="ip-br-hero__mob">Explore {counts.all} openings · {POINTS_PER_APPLICATION} pts per application · {pointsLabel}</p>
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
              className={`ip-br-btn ip-br-btn--ghost${filtersOpen ? ' is-on' : ''}`}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal />
              <span className="ip-br-filter-desk">Filter Options</span>
              <span className="ip-br-filter-mob">Filters</span>
              {filtersActiveCount > 0 ? <span className="ip-br-dot">{filtersActiveCount}</span> : null}
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
          <ListPresetsBar {...prefs} selectionResetKey={presetResetKey} />
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
              Work Mode / internship type
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
            <label>
              Max duration
              <select value={maxDuration} onChange={(e) => setMaxDuration(e.target.value)}>
                {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label>
              Start date
              <select value={startDate} onChange={(e) => setStartDate(e.target.value)}>
                {START_DATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <label className="ip-br-city-filter">
              Region
              <span className="ip-br-city-hint">Filter internships by employer region.</span>
              <SearchableMultiSelect
                options={countryOptions}
                value={selectedRegions}
                onChange={setSelectedRegions}
                placeholder="Select regions…"
                ariaLabel="Region"
                emptyHint="No regions"
                loading={countriesLoading && !(countryOptions || []).length}
              />
            </label>
            <label className="ip-br-city-filter">
              Work location (city)
              <span className="ip-br-city-hint">Searchable multi-select of work cities (separate from screening questions).</span>
              <SearchableMultiSelect
                options={browseCityOptions}
                value={selectedCities}
                onChange={setSelectedCities}
                loading={citiesLoading && !(browseCityOptions || []).length}
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
              All Internships ({counts.all})
            </button>
            <button type="button" className={tab === 'saved' ? 'is-on' : undefined} onClick={() => setTab('saved')}>
              <Bookmark fill="currentColor" />
              Saved Internships ({counts.saved})
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
              key={c.id || 'all'}
              type="button"
              className={`ip-br-qchip${chip === c.id ? ' is-on' : ''}`}
              onClick={() => setChip(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ip-br-mcount">
        <span><b>{loading ? '…' : total}</b> roles matching{total > PAGE_SIZE ? ` · page ${page}` : ''}</span>
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
                  <th>#</th>
                  <th>Role</th>
                  <th>Employer</th>
                  <th>Location</th>
                  <th>Start</th>
                  <th>Duration</th>
                  <th>Stipend</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((i, idx) => {
                  const confidential = i.company_name === 'Confidential employer';
                  const canLinkEmployer = !confidential && i.employer_id;
                  return (
                  <tr key={i.id}>
                    <td className="ip-br-num">{serialOffset + idx + 1}</td>
                    <td>
                      <div className="ip-br-cell-stack">
                        <button type="button" className="ip-ph-role" onClick={() => router.push(`/candidate/internships/${i.id}`)}>
                          {i.title}
                        </button>
                        {i.applied ? <span className="ip-br-applied">Applied</span> : null}
                      </div>
                    </td>
                    <td>
                      {canLinkEmployer ? (
                        <button
                          type="button"
                          className="ip-ph-role"
                          onClick={() => router.push(`/candidate/employers/${i.employer_id}`)}
                        >
                          {i.company_name}
                        </button>
                      ) : (
                        i.company_name
                      )}
                    </td>
                    <td>{[i.work_mode, i.location].filter(Boolean).join(' • ') || '—'}</td>
                    <td>{startLabel(i)}</td>
                    <td>{durationLabel(i)}</td>
                    <td>{stipendLabel(i)}</td>
                    <td>{i.match_score != null ? `${Math.round(Number(i.match_score))}%` : '—'}</td>
                  </tr>
                  );
                })}
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
                      {i.company_name !== 'Confidential employer' && i.employer_id ? (
                        <button
                          type="button"
                          className="ip-br-emp-link"
                          onClick={() => router.push(`/candidate/employers/${i.employer_id}`)}
                        >
                          {i.company_name}
                        </button>
                      ) : (
                        i.company_name
                      )}
                      {i.employer_verified ? <span className="ip-br-verified">Verified employer</span> : null}
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
                <span className="ip-br-match">
                  <Star fill="currentColor" />
                  {i.match_score != null ? `${Math.round(Number(i.match_score))}% Match` : '— Match'}
                </span>
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
                  <ValidationScoreButton
                    score={i.validation_score}
                    label={i.validation_label}
                    breakdown={i.validation_breakdown}
                  />
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
        <IpListPager
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
