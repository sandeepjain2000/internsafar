/**
 * Candidate Browse Internships filter state <-> list query.
 * Shared by the browse page and GET /api/ip/candidate/internships (useSaved=1)
 * so a server-applied saved view produces exactly the query the page would send.
 */

export const BROWSE_TABLE_KEY = 'candidate.internships';

export const BROWSE_TAB_IDS = ['unapplied', 'all', 'starting-soon', 'saved', 'recommended'];

export const BROWSE_DEFAULT_STATE = Object.freeze({
  q: '',
  minStipend: '0',
  maxDuration: '0',
  workMode: 'all',
  startDate: 'any',
  selectedRegions: [],
  selectedCities: [],
  minMatch: '0',
  minValidation: '',
  sort: 'best-match',
});

/** Overlay a saved view ({ filters, sort }) on `base`; absent fields keep the base value. */
export function browseStateFromSaved(view, base = BROWSE_DEFAULT_STATE) {
  const f = view?.filters && typeof view.filters === 'object' && !Array.isArray(view.filters) ? view.filters : {};
  const s = { ...base };
  if (f.q != null) s.q = String(f.q);
  if (f.minStipend != null) s.minStipend = String(f.minStipend);
  if (f.maxDuration != null) s.maxDuration = String(f.maxDuration);
  if (f.workMode != null) s.workMode = String(f.workMode);
  if (f.startDate != null) s.startDate = String(f.startDate);
  if (Array.isArray(f.selectedRegions)) s.selectedRegions = f.selectedRegions;
  if (Array.isArray(f.selectedCities)) s.selectedCities = f.selectedCities;
  if (f.minMatch != null) s.minMatch = String(f.minMatch);
  if (f.minValidation != null) s.minValidation = String(f.minValidation);
  if (view?.sort) s.sort = String(view.sort);
  return s;
}

export function browseQueryString(state, tab) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.minStipend === 'unpaid') params.set('stipendType', 'unpaid');
  else if (Number(state.minStipend)) params.set('minStipend', state.minStipend);
  if (Number(state.maxDuration)) params.set('maxDuration', state.maxDuration);
  if (state.workMode && state.workMode !== 'all') params.set('workMode', state.workMode);
  if (state.startDate && state.startDate !== 'any') params.set('startDate', state.startDate);
  if (state.selectedCities?.length) params.set('location', state.selectedCities.join(','));
  if (state.selectedRegions?.length) params.set('region', state.selectedRegions.join(','));
  if (Number(state.minMatch)) params.set('minMatch', state.minMatch);
  if (state.minValidation) params.set('minValidation', state.minValidation);
  params.set('sort', state.sort);
  if (tab === 'saved') params.set('savedOnly', '1');
  if (tab === 'recommended') params.set('recommended', '1');
  if (tab === 'unapplied' || tab === 'starting-soon') params.set('chip', tab);
  return params.toString();
}
