'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bookmark, CalendarDays, CheckCircle2, LayoutGrid, LogIn, Search, Sparkles, Star } from 'lucide-react';
import SearchableMultiSelect from '@/components/ip/SearchableMultiSelect';
import { onTablistKeyDown } from '@/lib/tablistKeys';
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
import { IpTableFiltersShell } from '@/components/ip/IpTableFiltersShell';
import '@/components/ip/ip-browse-internships-gemini.css';
import '@/components/ip/ip-table-filters.css';
import '@/components/ip/ip-list-pager.css';
import { formatInternshipStipend } from '@/lib/ipInternshipStipend';
import { readResponseJson } from '@/lib/readResponseJson';
import { fetchErrorMessage as loadErrorMessage, fetchJsonWithRetry } from '@/lib/fetchJsonWithRetry';
import { signOutAndEndSession } from '@/lib/ipClientSignOut';
import {
  BROWSE_DEFAULT_STATE,
  BROWSE_TABLE_KEY,
  browseQueryString,
  browseStateFromSaved,
} from '@/lib/ipBrowseFilters';

const PAGE_SIZE = 10;
const BROWSE_TAB_SESSION_KEY = 'ip_browse_tab';
const BROWSE_TABS = [
  { id: 'unapplied', label: 'Unapplied', icon: 'unapplied' },
  { id: 'all', label: 'All Internships', icon: 'all' },
  { id: 'starting-soon', label: 'Starting soon', icon: 'soon' },
  { id: 'saved', label: 'Saved', icon: 'saved' },
  { id: 'recommended', label: 'Recommended for You', icon: 'recommended' },
];
const BROWSE_TAB_IDS = new Set(BROWSE_TABS.map((t) => t.id));

function readSessionBrowseTab() {
  try {
    const v = String(sessionStorage.getItem(BROWSE_TAB_SESSION_KEY) || '').trim();
    if (BROWSE_TAB_IDS.has(v)) return v;
  } catch {
    /* ignore */
  }
  return 'unapplied';
}

function writeSessionBrowseTab(tabId) {
  try {
    sessionStorage.setItem(BROWSE_TAB_SESSION_KEY, tabId);
  } catch {
    /* ignore */
  }
}

function initialBrowseTab() {
  try {
    if (new URLSearchParams(window.location.search).get('saved') === '1') return 'saved';
  } catch {
    return 'unapplied';
  }
  return readSessionBrowseTab();
}

function createGate() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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

function browseTabIcon(kind) {
  if (kind === 'saved') return <Bookmark fill="currentColor" aria-hidden />;
  if (kind === 'recommended') return <Star aria-hidden />;
  if (kind === 'soon') return <CalendarDays aria-hidden />;
  if (kind === 'unapplied') return <Sparkles aria-hidden />;
  return <LayoutGrid aria-hidden />;
}

function browseTabCount(counts, tabId) {
  if (tabId === 'all') return counts.all ?? 0;
  if (tabId === 'unapplied') return counts.unapplied ?? 0;
  if (tabId === 'starting-soon') return counts.startingSoon ?? 0;
  if (tabId === 'saved') return counts.saved ?? 0;
  if (tabId === 'recommended') return counts.recommended ?? 0;
  return null;
}

export default function BrowseInternshipsPage() {
  const router = useRouter();
  const { placeCityOptions, cityOptions: catalogCities, loading: citiesLoading } = useIpCityCatalog();
  const { countryOptions, loading: countriesLoading } = useIpCountryCatalog();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({
    all: 0,
    unapplied: 0,
    startingSoon: 0,
    saved: 0,
    recommended: 0,
  });
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
  const [tab, setTab] = useState('unapplied');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [points, setPoints] = useState(null);
  const [viewMode, setViewMode] = useViewMode('ip_browse_view', 'list');
  const [presetResetKey, setPresetResetKey] = useState(0);
  const reqRef = useRef(0);
  const initialRequestRef = useRef(false);
  // Query already answered by the initial one-trip load; the first ready-triggered load skips it.
  const initialQueryRef = useRef(null);
  const [shownQuery, setShownQuery] = useState(null);
  const [serverViewGate] = useState(createGate);
  const { page, setPage, totalPages, total, pageItems, pageSize, serialOffset } = useClientPagination(items, PAGE_SIZE);

  const filterState = useMemo(() => ({
    q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort,
  }), [q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort]);
  const snapshot = useMemo(() => {
    const { sort: s, ...filters } = filterState;
    return { filters, sort: s };
  }, [filterState]);
  const prefs = useListPrefsSync({
    tableKey: BROWSE_TABLE_KEY,
    snapshot,
    serverView: serverViewGate.promise,
    applySnapshot: (s, { hydrate = false } = {}) => {
      // Saved view arrives after first paint: never overwrite filters the candidate already changed.
      if (hydrate && browseQueryString(filterState, 'all') !== browseQueryString(BROWSE_DEFAULT_STATE, 'all')) return;
      const next = browseStateFromSaved(s, filterState);
      setQ(next.q);
      setMinStipend(next.minStipend);
      setMaxDuration(next.maxDuration);
      setWorkMode(next.workMode);
      setStartDate(next.startDate);
      setSelectedRegions(next.selectedRegions);
      setSelectedCities(next.selectedCities);
      setMinMatch(next.minMatch);
      setMinValidation(next.minValidation);
      setSort(next.sort);
    },
  });

  function applyListResult(result) {
    if (result.ok && Array.isArray(result.data.items)) {
      setItems(result.data.items);
      if (result.data.counts) setCounts(result.data.counts);
      setHasLoaded(true);
      setLoadError(null);
      return true;
    }
    setLoadError({ kind: result.ok ? 'server' : result.kind });
    return false;
  }

  async function loadInitial() {
    const initialTab = initialBrowseTab();
    const id = ++reqRef.current;
    setLoading(true);
    let view = null;
    try {
      const result = await fetchJsonWithRetry(
        `/api/ip/candidate/internships?useSaved=1&tab=${encodeURIComponent(initialTab)}`,
      );
      const applied = id === reqRef.current && applyListResult(result);
      if (applied) {
        setShownQuery(result.data.appliedQuery ?? browseQueryString(BROWSE_DEFAULT_STATE, initialTab));
      }
      if (applied && result.data.savedView) {
        view = result.data.savedView;
        initialQueryRef.current = result.data.appliedQuery || null;
      } else {
        initialQueryRef.current = browseQueryString(BROWSE_DEFAULT_STATE, initialTab);
      }
    } finally {
      if (id === reqRef.current) setLoading(false);
      serverViewGate.resolve(view);
    }
  }

  useEffect(() => {
    const next = initialBrowseTab();
    setTab(next);
    writeSessionBrowseTab(next);
    if (!initialRequestRef.current) {
      initialRequestRef.current = true;
      loadInitial();
    }
    fetch('/api/ip/candidate/profile')
      .then((r) => readResponseJson(r, {}))
      .then((d) => setPoints(d.profile?.points ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectTab(nextTab) {
    setTab(nextTab);
    writeSessionBrowseTab(nextTab);
  }

  async function load({ fromEffect = false } = {}) {
    const listQuery = browseQueryString(filterState, tab);
    if (fromEffect && initialQueryRef.current !== null) {
      const alreadyAnswered = initialQueryRef.current === listQuery;
      initialQueryRef.current = null;
      if (alreadyAnswered) return;
    }

    const id = ++reqRef.current;
    setLoading(true);
    try {
      const result = await fetchJsonWithRetry(`/api/ip/candidate/internships?${listQuery}`);
      if (id !== reqRef.current) return;
      if (applyListResult(result)) setShownQuery(listQuery);
    } catch {
      if (id !== reqRef.current) return;
      setLoadError({ kind: 'server' });
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!prefs.ready) return undefined;
    const t = setTimeout(() => {
      load({ fromEffect: true });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.ready, q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort, tab]);

  useEffect(() => {
    if (loadError?.kind !== 'network') return undefined;
    const onOnline = () => load();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadError]);

  useEffect(() => {
    setPage(1);
  }, [q, minStipend, maxDuration, workMode, startDate, selectedRegions, selectedCities, minMatch, minValidation, sort, tab, setPage]);

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
    selectTab('unapplied');
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
  const countText = (n) => (hasLoaded ? n : loading ? '…' : '—');
  const anyFilterActive = Boolean(q.trim()) || filtersActiveCount > 0;
  const failed = Boolean(loadError) && !loading;
  const showErrorPanel = failed && (!hasLoaded || items.length === 0);
  const showRefreshNotice = failed && hasLoaded && items.length > 0;

  function resultLineText() {
    const tabTotal = browseTabCount(counts, tab);
    const noun = (n) => `internship${n === 1 ? '' : 's'}`;
    if (!anyFilterActive) return `Showing all ${tabTotal} ${noun(tabTotal)}`;
    const what = q.trim() && filtersActiveCount > 0
      ? 'your search and filters'
      : q.trim() ? 'your search' : 'your filters';
    return `Showing ${total} of ${tabTotal} ${noun(tabTotal)} matching ${what}`;
  }

  function renderEmptyState() {
    if (anyFilterActive) {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-filtered">
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
      );
    }
    if (!counts.all) {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-none-open">
          <div className="ip-br-empty__icon" aria-hidden>
            <LayoutGrid />
          </div>
          <h3>No internships are open right now</h3>
          <p>New internships appear here as soon as employers publish them. Check back soon.</p>
        </div>
      );
    }
    const viewAll = (
      <button type="button" className="ip-br-btn ip-br-btn--primary" onClick={() => selectTab('all')}>
        View all internships
      </button>
    );
    if (tab === 'unapplied') {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-all-applied">
          <div className="ip-br-empty__icon is-good" aria-hidden>
            <CheckCircle2 />
          </div>
          <h3>You&apos;ve applied to every open internship</h3>
          <p>
            New internships will show up here when employers publish them. Track your applications in{' '}
            <Link href="/candidate/applications">My applications</Link>.
          </p>
          {viewAll}
        </div>
      );
    }
    if (tab === 'saved') {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-saved">
          <div className="ip-br-empty__icon" aria-hidden>
            <Bookmark />
          </div>
          <h3>No saved internships yet</h3>
          <p>Use the bookmark on any internship card to save it for later.</p>
          {viewAll}
        </div>
      );
    }
    if (tab === 'starting-soon') {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-starting-soon">
          <div className="ip-br-empty__icon" aria-hidden>
            <CalendarDays />
          </div>
          <h3>No internships start in the next 3 weeks</h3>
          <p>Internships with a start date in the next 21 days appear here.</p>
          {viewAll}
        </div>
      );
    }
    if (tab === 'recommended') {
      return (
        <div className="ip-br-empty" data-testid="browse-empty-recommended">
          <div className="ip-br-empty__icon" aria-hidden>
            <Star />
          </div>
          <h3>No recommendations yet</h3>
          <p>
            Add skills and preferred roles in <Link href="/candidate/profile">your profile</Link> to get matched
            internships.
          </p>
          {viewAll}
        </div>
      );
    }
    return (
      <div className="ip-br-empty" data-testid="browse-empty-filtered">
        <div className="ip-br-empty__icon" aria-hidden>
          <Search />
        </div>
        <h3>No matching internships found</h3>
        <p>Try another tab or reset your filters.</p>
        <button type="button" className="ip-br-btn ip-br-btn--primary" onClick={resetFilters}>
          Reset All Filters &amp; Search
        </button>
      </div>
    );
  }

  function renderErrorPanel() {
    if (loadError?.kind === 'auth') {
      return (
        <div className="ip-br-empty ip-br-error" role="alert" data-testid="browse-session-expired">
          <div className="ip-br-empty__icon ip-br-error__icon" aria-hidden>
            <LogIn />
          </div>
          <h3>Your session has expired</h3>
          <p>Sign in again to keep browsing internships.</p>
          <button
            type="button"
            className="ip-br-btn ip-br-btn--primary"
            onClick={() => signOutAndEndSession({ callbackUrl: '/' })}
          >
            Sign in again
          </button>
        </div>
      );
    }
    return (
      <div className="ip-br-empty ip-br-error" role="alert" data-testid="browse-load-error">
        <div className="ip-br-empty__icon ip-br-error__icon" aria-hidden>
          <AlertTriangle />
        </div>
        <h3>We couldn&apos;t load internships</h3>
        <p>
          {loadErrorMessage(loadError?.kind)} This is a loading problem, not a lack of internships. Please try
          again.
        </p>
        <button type="button" className="ip-br-btn ip-br-btn--primary" onClick={() => load()} data-testid="browse-retry">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="ip-browse">
      <div className="ip-br-hero">
        <div>
          <div className="ip-br-hero__title">
            <h1>Browse Internships</h1>
            <span className="ip-br-chip ip-br-chip--desk">Marketplace</span>
            <span className="ip-br-chip ip-br-chip--mob">{countText(counts.all)} open</span>
            <button
              type="button"
              className="ip-br-m-saved"
              title="Saved internships"
              aria-label={`Saved internships (${counts.saved})`}
              onClick={() => selectTab('saved')}
            >
              <Bookmark fill={tab === 'saved' ? 'currentColor' : 'none'} />
              {counts.saved > 0 ? <span>{counts.saved}</span> : null}
            </button>
          </div>
          <p className="ip-br-hero__desk">Discover verified internship opportunities. Submitting an application uses {POINTS_PER_APPLICATION} points.</p>
          <p className="ip-br-hero__mob">Explore {countText(counts.all)} openings · {POINTS_PER_APPLICATION} pts per application · {pointsLabel}</p>
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

        <IpTableFiltersShell
          open={filtersOpen}
          onToggle={() => setFiltersOpen((v) => !v)}
          activeCount={filtersActiveCount}
          onClear={resetFilters}
        >
          <div className="ip-br-filter-grid">
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
            <div className="ip-br-city-filter">
              <span className="ip-br-city-filter__label">Region</span>
              <SearchableMultiSelect
                options={countryOptions}
                value={selectedRegions}
                onChange={setSelectedRegions}
                placeholder="Select regions…"
                ariaLabel="Region"
                emptyHint="No regions"
                loading={countriesLoading && !(countryOptions || []).length}
              />
            </div>
            <div className="ip-br-city-filter">
              <span className="ip-br-city-filter__label">Work location (city)</span>
              <SearchableMultiSelect
                options={browseCityOptions}
                value={selectedCities}
                onChange={setSelectedCities}
                loading={citiesLoading && !(browseCityOptions || []).length}
                placeholder="Type to search cities…"
                ariaLabel="Work location cities"
              />
            </div>
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
        </IpTableFiltersShell>

        <div className="mt-3">
          <ListPresetsBar {...prefs} selectionResetKey={presetResetKey} />
        </div>

        <div className="ip-br-tabs">
          <div className="ip-br-tabs__list" role="tablist" onKeyDown={onTablistKeyDown} aria-label="Browse views">
            {BROWSE_TABS.map((t) => {
              const count = browseTabCount(counts, t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? 'is-on' : undefined}
                  onClick={() => selectTab(t.id)}
                >
                  {browseTabIcon(t.icon)}
                  <span>{t.label}</span>
                  {count != null ? <span className="ip-br-tab-count">{countText(count)}</span> : null}
                </button>
              );
            })}
          </div>
          <button type="button" className="ip-br-reset" onClick={resetFilters}>Reset All Filters</button>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="ip-br-mcount">
        <span><b>{loading ? '…' : countText(total)}</b> roles matching{total > PAGE_SIZE ? ` · page ${page}` : ''}</span>
        <label className="ip-br-sort">
          <span>Sort by:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort internships">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      {showRefreshNotice ? (
        <div className="ip-br-refresh-error" role="alert" data-testid="browse-refresh-error">
          <AlertTriangle aria-hidden />
          {loadError.kind === 'auth' ? (
            <>
              <span>Your session has expired. Sign in again to update this list.</span>
              <button type="button" onClick={() => signOutAndEndSession({ callbackUrl: '/' })}>
                Sign in again
              </button>
            </>
          ) : (
            <>
              <span>Couldn&apos;t refresh internships. {loadErrorMessage(loadError.kind)} Showing your last results.</span>
              <button type="button" onClick={() => load()} data-testid="browse-refresh-retry">
                Try again
              </button>
            </>
          )}
        </div>
      ) : null}

      {hasLoaded && !showErrorPanel && !showRefreshNotice && items.length ? (
        <p className="ip-br-resultline" role="status" data-testid="browse-result-line">
          {browseQueryString(filterState, tab) === shownQuery ? resultLineText() : 'Updating results…'}
        </p>
      ) : null}

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
                  <th>Status</th>
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
                      <button type="button" className="ip-ph-role" onClick={() => router.push(`/candidate/internships/${i.id}`)}>
                        {i.title}
                      </button>
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
                    <td>
                      {i.applied ? (
                        <span className="ip-br-applied ip-br-applied--list">Applied</span>
                      ) : (
                        <span className="ip-br-status-empty">—</span>
                      )}
                    </td>
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
      ) : loading ? (
        <div className="ip-br-loading-wrap">
          <p className="ip-br-loading" role="status">Loading internships…</p>
          <div className="ip-br-skeleton" aria-hidden>
            {[0, 1, 2].map((k) => (
              <div key={k} className="ip-br-skeleton__row">
                <span className="ip-br-skeleton__avatar" />
                <span className="ip-br-skeleton__lines">
                  <span />
                  <span />
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : showErrorPanel ? (
        renderErrorPanel()
      ) : (
        renderEmptyState()
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
