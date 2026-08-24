'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, Search, SlidersHorizontal, Star } from 'lucide-react';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import ViewModeToggle from '@/components/ip/ViewModeToggle';
import ListPresetsBar from '@/components/ip/ListPresetsBar';
import { useListPrefsSync } from '@/hooks/useListPrefsSync';
import { useViewMode } from '@/hooks/useViewMode';
import { POINTS_PER_APPLICATION } from '@/lib/pointsEconomy';
import ValidationScoreButton from '@/components/ip/ValidationScoreButton';
import '@/components/ip/ip-browse-internships-gemini.css';

const QUICK_CHIPS = [
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
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, saved: 0, recommended: 0 });
  const [q, setQ] = useState('');
  const [minStipend, setMinStipend] = useState('0');
  const [workMode, setWorkMode] = useState('all');
  const [selectedCities, setSelectedCities] = useState([]);
  const [cityQuery, setCityQuery] = useState('');
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
      const f = s.filters || {};
      if (f.q != null) setQ(f.q);
      if (f.minStipend != null) setMinStipend(String(f.minStipend));
      if (f.workMode != null) setWorkMode(f.workMode);
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
    fetch('/api/ip/ref/cities')
      .then((r) => r.json())
      .then((d) => setCityOptions(d.items || []))
      .catch(() => {});
    fetch('/api/ip/candidate/profile')
      .then((r) => r.json())
      .then((d) => setPoints(d.profile?.points ?? null))
      .catch(() => {});
  }, []);

  async function load(next = {}) {
    const nextQ = next.q !== undefined ? next.q : q;
    const nextStipend = next.minStipend !== undefined ? next.minStipend : minStipend;
    const nextMode = next.workMode !== undefined ? next.workMode : workMode;
    const nextCities = next.selectedCities !== undefined ? next.selectedCities : selectedCities;
    const nextMatch = next.minMatch !== undefined ? next.minMatch : minMatch;
    const nextValid = next.minValidation !== undefined ? next.minValidation : minValidation;
    const nextSort = next.sort !== undefined ? next.sort : sort;
    const nextTab = next.tab !== undefined ? next.tab : tab;
    const nextChip = next.chip !== undefined ? next.chip : chip;

    const id = ++reqRef.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    if (Number(nextStipend)) params.set('minStipend', nextStipend);
    if (nextMode && nextMode !== 'all') params.set('workMode', nextMode);
    if (nextCities?.length) params.set('location', nextCities.join(','));
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
    if (Array.isArray(data.availableCities) && data.availableCities.length) {
      const merged = new Map();
      for (const c of [...CITY_PRESETS, ...data.availableCities]) {
        const key = String(c).toLowerCase();
        if (!merged.has(key)) merged.set(key, c);
      }
      setAvailableCities([...merged.values()].sort((a, b) => a.localeCompare(b)));
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!prefs.ready) return undefined;
    const t = setTimeout(() => {
      load();
    }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.ready, q, minStipend, workMode, selectedCities, minMatch, minValidation, sort, tab, chip]);

  async function toggleSave(internshipId, saved) {
    await fetch('/api/ip/candidate/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internshipId, saved: !saved }),
    });
    await load();
  }

  function toggleCity(city) {
    setSelectedCities((prev) => {
      const has = prev.some((c) => c.toLowerCase() === city.toLowerCase());
      if (has) return prev.filter((c) => c.toLowerCase() !== city.toLowerCase());
      return [...prev, city];
    });
  }

  function resetFilters() {
    setQ('');
    setMinStipend('0');
    setWorkMode('all');
    setSelectedCities([]);
    setCityQuery('');
    setMinMatch('0');
    setMinValidation('');
    setSort('best-match');
    setTab('all');
    setChip('');
    setFiltersOpen(false);
  }

  const filtersActive = useMemo(
    () => Number(minStipend) > 0 || workMode !== 'all' || selectedCities.length > 0 || Number(minMatch) > 0 || Boolean(minValidation),
    [minStipend, workMode, selectedCities, minMatch, minValidation],
  );

  const cityChoices = useMemo(() => {
    const needle = cityQuery.trim().toLowerCase();
    const list = availableCities.length ? availableCities : CITY_PRESETS;
    if (!needle) return list;
    return list.filter((c) => c.toLowerCase().includes(needle));
  }, [availableCities, cityQuery]);

  const pointsLabel = points == null ? '—' : `${points} Pts Available`;

  return (
    <div className="ip-browse">
      <div className="ip-br-hero">
        <div>
          <div className="ip-br-hero__title">
            <h1>Browse Internships</h1>
            <span className="ip-br-chip">Marketplace</span>
          </div>
          <p>Discover verified internship opportunities. Submitting an application uses {POINTS_PER_APPLICATION} points.</p>
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
            />
          </div>
          <div className="ip-br-toolbar__actions">
            <button
              type="button"
              className={`ip-br-btn ip-br-btn--ghost${filtersOpen ? ' is-on' : ''}`}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <SlidersHorizontal />
              Filter Options
              {filtersActive ? <span className="ip-br-dot">!</span> : null}
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
          <div className="ip-br-drawer">
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
                options={cityOptions.length ? cityOptions : CITY_PRESETS.map((c) => ({ value: c, label: c }))}
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
          </div>
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

      {items.length ? (
        viewMode === 'list' ? (
          <div className="ip-ph-list-wrap">
            <table className="ip-ph-list">
              <thead>
                <tr>
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
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <button type="button" className="ip-ph-role" onClick={() => router.push(`/candidate/internships/${i.id}`)}>
                        {i.title}
                      </button>
                    </td>
                    <td>{i.company_name}</td>
                    <td>{[i.work_mode, i.location].filter(Boolean).join(' • ') || '—'}</td>
                    <td>{startLabel(i)}</td>
                    <td>{durationLabel(i)}</td>
                    <td>{stipendLabel(i)}</td>
                    <td>{i.match_score != null ? `${Math.round(Number(i.match_score))}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="ip-br-grid">
          {items.map((i) => (
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
                      Review &amp; Apply ({POINTS_PER_APPLICATION} Pts)
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
    </div>
  );
}
